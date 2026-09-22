// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Alt+I";

/// 当前已注册的快捷键(I3 回滚语义的真相源):
/// set_hotkey 先注册新键,成功后才注销旧键 —— 新键失败时旧键原样存活。
struct HotkeyState(Mutex<Option<String>>);

/// Show + focus the main window. Hotkey, tray and second-instance all land here.
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    // dev(含 WSLg 无托盘/无全局热键环境):隐藏后无入口唤回,直接 no-op;
    // release 行为不变(Esc/失焦隐藏,托盘常驻)。
    if cfg!(debug_assertions) {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Swap the global hotkey registration. Persistence is the frontend's job
/// (settings are saved before invoking this); Rust only re-registers.
/// Rollback contract (I3): register(new) FIRST — on failure the OLD key stays
/// live and we return Err; only after success do we unregister the old one.
#[tauri::command]
fn set_hotkey(
    app: tauri::AppHandle,
    state: tauri::State<HotkeyState>,
    accel: String,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut cur = state.0.lock().map_err(|e| e.to_string())?;
    if cur.as_deref() == Some(accel.as_str()) {
        return Ok(()); // 同值幂等
    }
    gs.register(accel.as_str()).map_err(|e| e.to_string())?; // 失败:旧键未动
    if let Some(old) = cur.take() {
        if old != accel {
            // 新键已生效;旧键注销失败仅残留(非致命,下次换键时 unregister_all 不会发生)
            if let Err(e) = gs.unregister(old.as_str()) {
                eprintln!("old hotkey {old:?} unregister failed: {e}");
            }
        }
    }
    *cur = Some(accel);
    Ok(())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())
    } else {
        autolaunch.disable().map_err(|e| e.to_string())
    }
}

/// Startup hotkey comes from the persisted store (frontend key "settings.hotkey");
/// empty/missing/invalid falls back to the default.
fn stored_hotkey(app: &tauri::AppHandle) -> String {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|v| {
            v.get("hotkey")
                .and_then(|h| h.as_str())
                .map(str::to_string)
        })
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| DEFAULT_HOTKEY.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(HotkeyState(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show(app)))
        // 只恢复几何(尺寸/位置/最大化):默认 all() 含 VISIBLE,会在上次保存时窗口
        // 可见的情形下启动即 show(),破坏 visible:false 托盘常驻/热键唤起语义。
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show(app);
                        let _ = app.emit("hotkey-triggered", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_window,
            set_hotkey,
            set_autostart
        ])
        .setup(|app| {
            // ── Win11 原生圆角(DWM):不用透明窗,保系统 resize 框架+阴影;
            // DWMWCP_ROUND 磨圆角。Win10 无此属性时自动退化为方角(同 Raycast)。──
            #[cfg(target_os = "windows")]
            {
                use windows_sys::Win32::Foundation::HWND;
                use windows_sys::Win32::Graphics::Dwm::{
                    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
                    DWM_WINDOW_CORNER_PREFERENCE_DWMWCP_ROUND,
                };
                if let Some(w) = app.get_webview_window("main") {
                    let h = w.hwnd()?;
                    let pref = DWM_WINDOW_CORNER_PREFERENCE_DWMWCP_ROUND;
                    DwmSetWindowAttribute(
                        HWND(h.0 as isize),
                        DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                        &pref as *const _ as *const core::ffi::c_void,
                        std::mem::size_of_val(&pref) as u32,
                    );
                }
            }

            // ── Tray: menu (查询/退出) + left-click show ──
            let show_i = MenuItem::with_id(app, "show", "查询", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("bundle icon missing").clone())
                .menu(&Menu::with_items(app, &[&show_i, &quit_i])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── Startup hotkey: persisted value, default on failure.
            // register() (no per-shortcut handler) → builder's with_handler
            // fires exactly once; on_shortcut(+handler) would double-fire it.
            let accel = stored_hotkey(app.handle());
            let registered =
                if let Err(e) = app.global_shortcut().register(accel.as_str()) {
                    eprintln!("hotkey {accel:?} invalid ({e}); falling back to {DEFAULT_HOTKEY:?}");
                    app.global_shortcut()
                        .register(DEFAULT_HOTKEY)
                        .expect("default hotkey registration");
                    DEFAULT_HOTKEY.to_string()
                } else {
                    accel
                };
            if let Ok(mut cur) = app.state::<HotkeyState>().0.lock() {
                *cur = Some(registered);
            }

            // ── Blur → hide (window hides, process stays tray-resident) ──
            // dev(WSLg)跳过:无托盘环境失焦即永久唤不回;release 正常注册。
            if !cfg!(debug_assertions) {
                let win = app
                    .get_webview_window("main")
                    .expect("main window missing");
                let win_clone = win.clone();
                win.on_window_event(move |e| {
                    if let tauri::WindowEvent::Focused(false) = e {
                        let _ = win_clone.hide();
                    }
                });
            }

            // ── dev 逃生门:启动即显示(WSLg/无托盘环境的唯一入口)──
            if cfg!(debug_assertions) {
                show(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
