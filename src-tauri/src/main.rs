// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Alt+I";

/// 当前已注册的快捷键(I3 回滚语义的真相源):
/// set_hotkey 先注册新键,成功后才注销旧键 —— 新键失败时旧键原样存活。
struct HotkeyState(Mutex<Option<String>>);

/// 启动几何守卫:window-state 插件可能还原出最小化残骸几何(实测
/// 215x26 @ -32000 存盘,215=144dpi 下标题条 stub)——低于 conf 的 min 尺寸或
/// 屏外坐标 → 重置默认尺寸并居中。纯判定函数抽出供测试。
fn geometry_is_broken(logical: (f64, f64), pos: (i32, i32)) -> bool {
    const MIN_W: f64 = 640.0; // 与 tauri.conf.json minWidth/minHeight 同步
    const MIN_H: f64 = 400.0;
    logical.0 < MIN_W || logical.1 < MIN_H || pos.0 < -10000 || pos.1 < -10000
}

/// Show + focus the main window. Hotkey, tray and second-instance all land here.
/// unminimize 先行:show() 只调 SW_SHOW,不解除 iconic 状态,跳过它热键唤不回
/// 最小化窗口(v0.1.5 Windows 实测)。现 skipTaskbar:false,最小化停任务栏、
/// blur-hide 亦有 is_minimized 守卫(见 Focused(false));但任务栏态仍属 iconic,
/// 恢复前台必须显式 unminimize,故此序不可倒。
fn show(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    if let Err(error) = app.show() {
        eprintln!("could not unhide application: {error}");
    }
    if let Some(w) = app.get_webview_window("main") {
        if let Err(error) = w.unminimize().and_then(|_| w.show()).and_then(|_| w.set_focus()) {
            eprintln!("could not show main window: {error}");
        }
    }
}

/// 前台窗口类名是否为终端(conhost = ConsoleWindowClass,Windows Terminal
/// = CASCADIA_HOSTING_WINDOW_CLASS):终端里无选区的 Ctrl+C 是 SIGINT,会杀掉
/// 前台进程,这类窗口宁可跳过模拟复制。纯函数不加 cfg,非 Windows 也能测。
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn is_console_class(class: &str) -> bool {
    class == "ConsoleWindowClass" || class == "CASCADIA_HOSTING_WINDOW_CLASS"
}

/// 热键事件 payload(与前端 HotkeyPayload 的契约,字段名一字不差):
/// selected = 捕获到的选中文本;reason = 出口原因,前端按其路由
/// (captured→直接查询 / clipboard-fallback→查剪贴板 / 其余→捕获失败提示)。
/// Clone 是 tauri Emitter::emit 的 bound 要求,序列化形状不受影响。
#[derive(serde::Serialize, Clone)]
pub struct HotkeyCapture {
    pub selected: Option<String>,
    pub reason: &'static str, // "captured" | "clipboard-fallback" | "timeout" | "non-text-clipboard"
}

/// Windows 划词捕获:先强制抬起修饰键,再向当前前台窗口模拟 Ctrl+C,
/// 轮询剪贴板取回选中文本。
///
/// 根因(v0.1.10 划词全应用失败):热键 Ctrl+Alt+I 触发时用户手指仍物理按着
/// Ctrl+Alt,此刻模拟的 Ctrl+C 到达前台窗口实为 Ctrl+Alt+C(Alt 按下 →
/// 菜单加速键/无效组合),复制从未发生 → 150ms 轮询超时 → 静默回退查旧
/// 剪贴板 = 症状。参考 InkTimeRecord/TTime 的 GlobalShortcutEvent:模拟
/// 复制前先用 SendInput 强制抬起全部修饰键,本函数同款做法。
/// 每步 eprintln 一行诊断日志,真机排障靠它(dev/WSLg 控制台可见)。
#[cfg(target_os = "windows")]
fn read_selection(app: &tauri::AppHandle) -> HotkeyCapture {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_C, VK_CONTROL,
        VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow};

    // 轮询参数:每 20ms 探一次剪贴板,总等待 ≤500ms(旧 150ms 对慢应用偏紧,
    // 拉长到 500ms 让记事本以外的慢路径也有机会)。
    const POLL_STEP_MS: u64 = 20;
    const POLL_CAP_MS: u64 = 500;

    // 守卫 1:前台是终端 → 模拟 Ctrl+C 会发 SIGINT 杀进程,宁可不捕获;
    // 前端拿到 clipboard-fallback 继续走查剪贴板路径(设计内)。
    let mut fg_class = String::new();
    let fg = unsafe { GetForegroundWindow() };
    if !fg.is_null() {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(fg, buf.as_mut_ptr(), buf.len() as i32) };
        fg_class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
    }
    eprintln!("[hotkey] foreground class={fg_class:?}");
    if is_console_class(&fg_class) {
        eprintln!("[hotkey] guard1 terminal foreground -> clipboard-fallback");
        return HotkeyCapture { selected: None, reason: "clipboard-fallback" };
    }

    // 守卫 2(Q7):剪贴板当前非文本(图片/文件)→ 模拟复制会毁掉它,而我们
    // 只有旧文本可恢复,此路径不得动剪贴板;空串是合法文本,照常走。
    let saved = match app.clipboard().read_text() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[hotkey] guard2 non-text clipboard ({e:?}) -> non-text-clipboard");
            return HotkeyCapture { selected: None, reason: "non-text-clipboard" };
        }
    };

    // down 事件标志为 0(纯虚拟键码,不带 SCANCODE/UNICODE/EXTENDEDKEY),
    // up 事件带 KEYEVENTF_KEYUP。
    let key = |vk: u16, up: u32| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: up,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    // 根因修复第一步:SendInput 8 个 KEYUP 把 Ctrl/Alt/Shift/Win 的左右修饰键
    // 全部强制抬起(物理键用户还按着,这里只在输入流里插入 UP 抵消其逻辑
    // 按下态,否则下面的 Ctrl+C 会被污染成 Ctrl+Alt+C)。
    let ups = [
        key(VK_LCONTROL, KEYEVENTF_KEYUP),
        key(VK_RCONTROL, KEYEVENTF_KEYUP),
        key(VK_LMENU, KEYEVENTF_KEYUP),
        key(VK_RMENU, KEYEVENTF_KEYUP),
        key(VK_LSHIFT, KEYEVENTF_KEYUP),
        key(VK_RSHIFT, KEYEVENTF_KEYUP),
        key(VK_LWIN, KEYEVENTF_KEYUP),
        key(VK_RWIN, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            ups.len() as u32,
            ups.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    eprintln!("[hotkey] modifier keyup SendInput sent={}/8", sent);
    std::thread::sleep(Duration::from_millis(20)); // 让修饰键抬起状态先落地

    // 清空剪贴板做变更检测:旧法比对「新文本 != 旧文本」会漏检「选中文本 ==
    // 剪贴板旧值」;改为先清空,轮询时「读到非空 = 捕获成功」。是我们清空的,
    // 出口(成功/超时)都必须 write_text(&saved) 恢复,不能留空。
    if let Err(e) = app.clipboard().write_text("") {
        eprintln!("[hotkey] clipboard clear failed ({e:?}); 变更检测降级,可能误读旧值");
    }

    // 根因修复第二步:干净的 Ctrl+C 四事件一次 SendInput。
    let events = [
        key(VK_CONTROL, 0),
        key(VK_C, 0),
        key(VK_C, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe {
        SendInput(
            events.len() as u32,
            events.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
    }

    // 轮询:读到非空文本 = 复制发生 → 取回并恢复旧剪贴板;读到空 = 复制
    // 未发生,继续轮;Err = 其他进程瞬时持锁,按未就绪继续轮。
    for i in 1..=(POLL_CAP_MS / POLL_STEP_MS) {
        std::thread::sleep(Duration::from_millis(POLL_STEP_MS));
        if let Ok(cur) = app.clipboard().read_text() {
            if !cur.is_empty() {
                let _ = app.clipboard().write_text(&saved);
                eprintln!(
                    "[hotkey] captured at ~{}ms ({} chars) -> clipboard restored",
                    i * POLL_STEP_MS,
                    cur.chars().count()
                );
                return HotkeyCapture { selected: Some(cur), reason: "captured" };
            }
        }
        if i % 5 == 0 {
            eprintln!("[hotkey] polling {}/{}ms, no capture yet", i * POLL_STEP_MS, POLL_CAP_MS);
        }
    }
    let _ = app.clipboard().write_text(&saved); // 超时也必须恢复:清空是我们做的
    eprintln!("[hotkey] timeout after {POLL_CAP_MS}ms -> clipboard restored, reason=timeout");
    HotkeyCapture { selected: None, reason: "timeout" }
}

#[cfg(not(target_os = "windows"))]
fn read_selection(_app: &tauri::AppHandle) -> HotkeyCapture {
    // 划词仅 Windows 实现;其他平台统一 clipboard-fallback,前端走剪贴板路径
    HotkeyCapture { selected: None, reason: "clipboard-fallback" }
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

/// invoke("http_get") 的回复体:status+body 原样透传,非 2xx 不算错误
/// (由前端按状态码自行分支);只有 reqwest 层错误才走 Err。
#[derive(serde::Serialize)]
pub struct HttpReply {
    pub status: u16,
    pub body: String,
}

/// 全局池化 HTTP 客户端:tauri-plugin-http 每次 fetch 新建 Client,连接池
/// 用完即弃,每次查询都重付 DNS+TCP+TLS 冷启动(跨境实测 646ms~2s);
/// 静态共享一个 Client,划词热路径复用池内热连接。
static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("http client")
});

/// 流式查询池化客户端(与 CLIENT 分池):只限 connect_timeout(15s),
/// 不设总超时 —— 慢流(100 IP)合法,CLIENT 的 15s 总超时会把它拦腰斩断;
/// TLS 与 CLIENT 同走全局 ring provider,不额外配置。
static STREAM_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("stream http client")
});

/// headers 透传(前端 header 名/值字符串 → HeaderMap):非法头名/头值
/// (坏字符、控制字符等)跳过,宁缺毋炸。
fn parse_headers(map: Option<HashMap<String, String>>) -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    if let Some(map) = map {
        for (k, v) in map {
            if let (Ok(name), Ok(val)) = (
                k.parse::<reqwest::header::HeaderName>(),
                v.parse::<reqwest::header::HeaderValue>(),
            ) {
                h.insert(name, val);
            }
        }
    }
    h
}

/// 池化 GET(前端经 invoke("http_get", { url, headers }) 调用):
/// headers 经 parse_headers 透传;非 2xx 原样返回 status+body;
/// reqwest 层错误(连接/超时等传输层)→ Err;
/// charset 特性下 text() 有损解码,坏编码不报错。
#[tauri::command]
async fn http_get(
    url: String,
    headers: Option<HashMap<String, String>>,
) -> Result<HttpReply, String> {
    let resp = CLIENT
        .get(url)
        .headers(parse_headers(headers))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(HttpReply { status, body })
}

/// 流帧:块数据 + 完结标记,同走 Channel(块间 index 全序)。
/// End 帧存在的原因:Channel 投递走 eval/内嵌 fetch,invoke 返回走 IPC 应答,
/// 两条路径先后无契约 —— 客户端若以 invoke resolve 当流尽信号,会丢竞态中
/// 晚到的末块(NDJSON done 行)→ "stream ended before done"。
#[derive(serde::Serialize)]
#[serde(tag = "t", rename_all = "lowercase")]
enum StreamFrame {
    Chunk { data: Vec<u8> },
    End { status: u16 },
}

/// 流式 POST(前端 ipradar.queryMany 经 invoke("http_stream") 调用):走
/// STREAM_CLIENT(池化、无总超时)。2xx → 逐块 on_chunk.send(StreamFrame::Chunk),
/// 流尽后补发 End 帧再返回(完结信号与块同通道保序);非 2xx → 不发任何帧,
/// 读全 body 连同 status 返回(前端按错误信封转 error section);reqwest 层
/// 错误(连接/超时等传输层)→ Err。
#[tauri::command]
async fn http_stream(
    url: String,
    headers: Option<HashMap<String, String>>,
    body: String,
    on_chunk: tauri::ipc::Channel<StreamFrame>,
) -> Result<HttpReply, String> {
    use futures_util::StreamExt; // bytes_stream() 的 next()
    let resp = STREAM_CLIENT
        .post(url)
        .headers(parse_headers(headers))
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if status >= 300 {
        // 非 2xx:零帧无双路竞争,错误信封走返回值(与旧契约一致)
        let body = resp.text().await.map_err(|e| e.to_string())?;
        return Ok(HttpReply { status, body });
    }
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let _ = on_chunk.send(StreamFrame::Chunk { data: chunk.to_vec() });
    }
    // 完结帧:与全部块同通道且在其后(index 全序),客户端据此收尾 ——
    // invoke 返回值(即使先到)只是传输层回执,不作流尽信号
    let _ = on_chunk.send(StreamFrame::End { status });
    Ok(HttpReply {
        status,
        body: String::new(),
    })
}

/// 打开外部 URL(新版本提醒「去下载」跳 releases 页):不引 opener 插件,
/// 三平台各一行系统命令即零新依赖;URL 由前端硬编码常量传入,无外部
/// 输入面,仍以 https:// 白名单首行守卫防未来调用方。spawn 失败(如裸 WSL 无 xdg-open)→ Err,
/// 前端静默吞掉(失败静默是版本检查的共识行为)。
#[tauri::command]
fn open_url(url: &str) -> Result<(), String> {
    // 只放行 https://:挡未来调用方注入 cmd 元字符 / start "url" 标题解析陷阱
    if !url.starts_with("https://") {
        return Err("https:// only".to_string());
    }
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start"]);
        c.arg(url);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };
    cmd.status().map(|_| ()).map_err(|e| e.to_string())
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

/// 启动预热用的 serverUrl(stored_hotkey 同款读法):settings.json 的
/// settings.serverUrl,空/缺失 → None(预热是尽力而为,直接跳过)。
fn stored_server_url(app: &tauri::AppHandle) -> Option<String> {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|v| {
            v.get("serverUrl")
                .and_then(|u| u.as_str())
                .map(str::to_string)
        })
        .filter(|u| !u.is_empty())
}

/// 开机自启动对账用(stored_server_url 同款读法):settings.json 的
/// settings.autostart,缺失 → false。
fn stored_autostart(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|v| {
            v.get("autostart")
                .and_then(|b| b.as_bool())
        })
        .unwrap_or(false)
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
    // 0.13 的 rustls-no-provider 不自带 provider:reqwest 构建 client 时取
    // 进程默认 CryptoProvider,缺省会 panic。装 ring 而非 aws-lc:与锁内
    // reqwest 0.12 的 rustls 路径共用同一个 ring,不把 aws-lc-sys/cmake
    // 拖进 mac/msvc 发布工具链(tauri core 同款,见其 protocol/tauri.rs)。
    // 已被装过时返回 Err,幂等忽略。
    let _ = rustls::crypto::ring::default_provider().install_default();

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
            Some(vec!["--background"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let app = app.clone();
                        std::thread::spawn(move || {
                            // 顺序硬约束:捕获先于 show() —— show 抢走焦点后,
                            // 模拟的 Ctrl+C 就发给了本应用自己;阻塞至多
                            // ~550ms(20ms 修饰键落地 + 500ms 轮询),放后台
                            // 线程以免卡热键分发。
                            let capture = read_selection(&app);
                            show(&app);
                            let _ = app.emit("hotkey-triggered", capture);
                        });
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_window,
            set_hotkey,
            set_autostart,
            http_get,
            http_stream,
            open_url
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
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── 启动几何守卫:还原出残骸几何(最小化存盘)→ 重置默认并居中 ──
            {
                let w = app.get_webview_window("main").expect("main window missing");
                let scale = w.scale_factor().unwrap_or(1.0);
                let size = w.inner_size().map(|s| {
                    (s.width as f64 / scale, s.height as f64 / scale)
                }).unwrap_or((0.0, 0.0));
                let pos = w.outer_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
                if geometry_is_broken(size, pos) {
                    eprintln!("window-state restored broken geometry {size:?} @ {pos:?}; resetting");
                    let _ = w.set_size(tauri::LogicalSize::new(780.0, 500.0));
                    let _ = w.center();
                }
            }

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

            // ── 开机自启动对账:store 是唯一真相,但设置页只在开关值变化时
            // 才调 set_autostart —— 注册表被清理工具抹掉/当次写入失败后,
            // 开关显示"开"却永不重写,自启动静默失效(2026-10-01 Windows
            // 实案:Run 与 StartupApproved 两条全空)。启动时按 store 强制
            // 对齐系统真实状态;失败只打日志,下次启动再试。
            // ponytail: 只在启动时对账,运行中 purge 要等下次启动才自愈。──
            {
                use tauri_plugin_autostart::ManagerExt;
                let h = app.handle();
                let want = stored_autostart(h);
                let have = h.autolaunch().is_enabled().unwrap_or(false);
                if want != have {
                    let r = if want {
                        h.autolaunch().enable()
                    } else {
                        h.autolaunch().disable()
                    };
                    if let Err(e) = r {
                        eprintln!("autostart reconcile to {want} failed: {e}");
                    }
                }
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
                        // 最小化 → 停任务栏(skipTaskbar 已 false),不 hide;
                        // blur-hide 只针对真失焦,否则点 — 会连任务栏入口一起消失。
                        if win_clone.is_minimized().unwrap_or(false) {
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

            // ── 启动预热:后台对 serverUrl 各 GET 一次,把 DNS+TCP+TLS 提前
            // 跑热,暖两个池(CLIENT 更新检查 + STREAM_CLIENT 流式查询,
            // 连接池互不共享,各暖各的),划词首查直接复用池内热连接
            // (db-status 是前端既有的轻量状态端点,同 host 即可暖连接,且无需
            // 鉴权头)。只暖启动时的 host,换 serverUrl 后首查仍冷;空/缺失
            // 跳过,失败静默。──
            if let Some(base) = stored_server_url(app.handle()) {
                let url = format!("{}/api/db-status", base.trim_end_matches('/'));
                tauri::async_runtime::spawn(async move {
                    // 必须读完响应体连接才能回池;未读就 drop 会直接断连,预热白做。
                    // 两池各暖各的,前一个失败不影响后一个。
                    if let Ok(r) = CLIENT.get(&url).send().await {
                        let _ = r.text().await;
                    }
                    if let Ok(r) = STREAM_CLIENT.get(&url).send().await {
                        let _ = r.text().await;
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            match _event {
                // Finder/Dock sends Reopen to the running process; it does not
                // start a second process for the single-instance callback.
                tauri::RunEvent::Reopen { .. } => show(_app),
                tauri::RunEvent::Ready
                    if !std::env::args().any(|arg| arg == "--background") =>
                {
                    show(_app);
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    /// RC1 回归钉(v0.1.3 Windows 全灭):平台覆盖的 windows 数组会被
    /// RFC7396 merge-patch 【整体替换】,覆盖条目必须携带主配置窗口的全量字段,
    /// 否则丢失字段全部回退默认值(decorated:true / visible:true / 800×600 /
    /// 任务栏可见)。此测试钉住覆盖完整性。
    #[test]
    fn broken_geometry_detection() {
        assert!(geometry_is_broken((215.0, 26.0), (-32000, -32000))); // 实测投毒值
        assert!(geometry_is_broken((300.0, 300.0), (100, 100))); // 低于 min
        assert!(geometry_is_broken((800.0, 500.0), (-21333, 100))); // 屏外
        assert!(!geometry_is_broken((640.0, 400.0), (0, 0))); // 边界=min 合法
        assert!(!geometry_is_broken((780.0, 500.0), (485, 275))); // 正常
    }

    #[test]
    fn console_class_detection() {
        assert!(is_console_class("ConsoleWindowClass")); // conhost
        assert!(is_console_class("CASCADIA_HOSTING_WINDOW_CLASS")); // Windows Terminal
        assert!(!is_console_class("Chrome_WidgetWin_1")); // 普通应用窗口
        assert!(!is_console_class("")); // GetClassNameW 失败(返回 0)→ 不拦截
    }

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
