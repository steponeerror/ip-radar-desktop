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
/// unminimize 先行:show() 只调 SW_SHOW,不解除 iconic 状态 —— 配合 skipTaskbar
/// 会让最小化后的窗口在屏幕上零痕迹,热键永远唤不回(v0.1.5 Windows 实测)。
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
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

/// Windows:焦点是否已真正离开本窗口树。WebView2 是子 HWND,点击内容会把
/// Win32 焦点转给子窗口 → 父窗口 WM_KILLFOCUS → tao 发 Focused(false) ——
/// 这是窗口内部的焦点转移,不是失活,不能触发失焦隐藏(v0.1.3 Windows
/// “一点击就缩回去”的根因)。GetFocus 返回当前线程焦点窗口,取它的 GA_ROOT
/// 与本窗口 HWND 比对:还在树内 = 未失焦。
#[cfg(target_os = "windows")]
fn focus_left_window(w: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetFocus;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetAncestor, GA_ROOT};
    let Ok(h) = w.hwnd() else { return true };
    let mine = h.0 as isize as HWND;
    unsafe {
        let focused = GetFocus();
        if focused.is_null() {
            return true; // 焦点已在本线程之外 → 真失焦
        }
        GetAncestor(focused, GA_ROOT) != mine
    }
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
                    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
                };
                if let Some(w) = app.get_webview_window("main") {
                    let h = w.hwnd()?;
                    let pref = DWMWCP_ROUND;
                    unsafe {
                        DwmSetWindowAttribute(
                            h.0 as isize as HWND,
                            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                            &pref as *const _ as *const core::ffi::c_void,
                            std::mem::size_of_val(&pref) as u32,
                        );
                    }
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
                        #[cfg(target_os = "windows")]
                        if !focus_left_window(&win_clone) {
                            return;
                        }
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

#[cfg(test)]
mod tests {
    use serde_json::Value;

    /// RC1 回归钉(v0.1.3 Windows 全灭):平台覆盖的 windows 数组会被
    /// RFC7396 merge-patch 【整体替换】,覆盖条目必须携带主配置窗口的全量字段,
    /// 否则丢失字段全部回退默认值(decorated:true / visible:true / 800×600 /
    /// 任务栏可见)。此测试钉住覆盖完整性。
    #[test]
    fn windows_overlay_must_cover_base_window_config() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let base: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("tauri.conf.json")).unwrap(),
        )
        .unwrap();
        let overlay: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("tauri.windows.conf.json")).unwrap(),
        )
        .unwrap();
        let base_win = base["app"]["windows"][0]
            .as_object()
            .expect("base window object");
        let ov_win = overlay["app"]["windows"][0]
            .as_object()
            .expect("overlay window object");
        // 键集合一致(transparent/shadow 是仅允许的平台差异键)
        assert_eq!(
            base_win.len(),
            ov_win.len(),
            "覆盖与主配置窗口字段数不一致(仅允许 transparent/shadow 取值差异)"
        );
        for (k, v) in base_win {
            if k == "transparent" || k == "shadow" {
                continue;
            }
            assert_eq!(
                ov_win.get(k),
                Some(v),
                "tauri.windows.conf.json 缺字段 {k}:RFC7396 数组整体替换会把它顶成默认值"
            );
        }
        assert_eq!(ov_win.get("transparent"), Some(&Value::Bool(false)));
        assert_eq!(ov_win.get("shadow"), Some(&Value::Bool(true)));
        // 全链路:codegen 同款 read_from(Target::Windows) 证实合并结果就是覆盖数组
        let (merged, paths) = tauri_utils::config::parse::read_from(
            tauri_utils::platform::Target::Windows,
            dir,
        )
        .unwrap();
        assert!(
            paths.iter().any(|p| p.ends_with("tauri.windows.conf.json")),
            "平台覆盖文件未被 tauri 解析器发现"
        );
        assert_eq!(merged["app"]["windows"][0], overlay["app"]["windows"][0]);
    }
}
