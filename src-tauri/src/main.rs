// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Alt+I";

/// Show + focus the main window. Hotkey, tray and second-instance all land here.
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Swap the global hotkey registration. Persistence is the frontend's job
/// (settings are saved before invoking this); Rust only re-registers.
#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, accel: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    gs.register(accel.as_str()).map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show(app)))
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
            if let Err(e) = app.global_shortcut().register(accel.as_str()) {
                eprintln!("hotkey {accel:?} invalid ({e}); falling back to {DEFAULT_HOTKEY:?}");
                app.global_shortcut()
                    .register(DEFAULT_HOTKEY)
                    .expect("default hotkey registration");
            }

            // ── Blur → hide (window hides, process stays tray-resident) ──
            let win = app
                .get_webview_window("main")
                .expect("main window missing");
            let win_clone = win.clone();
            win.on_window_event(move |e| {
                if let tauri::WindowEvent::Focused(false) = e {
                    let _ = win_clone.hide();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
