# IP Radar Desktop

<p align="center">
  <a href="https://ipradar.huxiao0207.dpdns.org"><img src="https://img.shields.io/badge/%F0%9F%93%A1_Live_Demo-ipradar.huxiao0207.dpdns.org-FF6B35?style=for-the-badge" alt="Live Demo"></a>
</p>

[简体中文](#简体中文) | [English](#english)

<p align="center">
  <img src="assets/hero.png" alt="IP Radar Desktop — multi-IP lookup with consensus badges">
</p>

## 简体中文

**IP Radar 的官方桌面伴侣。** 托盘常驻,全局快捷键(`Ctrl/Cmd+Alt+I`)唤起 → 自动读取剪贴板中的 IP → 多源并行查询 → 弹窗展示完整画像。安全运维的贴身 IP 情报入口。

- **一键即查** —— 复制 IP 后按下快捷键,剪贴板中的 IP(单个或一批,上限可在设置中调整)直接出结果,无需粘贴确认
- **划词查询(仅 Windows)** —— 无需先复制:选中文本后直接按快捷键,自动捕获选区优先查询其中的 IP;选区无 IP 时回退剪贴板
- **多源并列** —— 查询你自部署的 [IP Radar](https://github.com/steponeerror/ip-radar) server(verdict / 置信度 / geo / ASN / 分类证据),同时并列 [AbuseIPDB](https://www.abuseipdb.com/) 云端信誉;源互相隔离,一个挂了另一个照常
- **源可插拔** —— 新增查询源 = 在 `src/sources/` 加一个文件,零注册代码
- **多 IP 批量** —— 从日志/告警里复制的一串 IP 一次全查,紧凑列表点击展开详情,verdict 徽章一目了然
- **多平台** —— Linux / macOS / Windows 三平台构建,轻量(Tauri 2)

<p align="center">
  <img src="assets/detail.png" alt="Expanded IP detail — source cards with evidence">
</p>

### 安装

**macOS —— 推荐 Homebrew**

```bash
brew install --cask steponeerror/ipradar/ip-radar-desktop
```

更新:`brew upgrade --cask ip-radar-desktop`。仅支持 Apple Silicon(arm64)Mac。

次选:从 [Releases](../../releases) 直接下载 `.dmg`。应用未签名,仅自担风险者用,首次运行需执行:

```bash
xattr -cr "/Applications/IP Radar Desktop.app"
```

(或右键 → 打开)

**Windows**

从 [Releases](../../releases) 下载便携版 `.exe`(免安装,双击即用)。未签名,SmartScreen 弹「已保护你的电脑」时点「更多信息 → 仍要运行」。

**Linux**

暂无安装包,请[从源码构建](#从源码构建)。

### 配置

打开设置(窗口右上角齿轮):

- **Server URL** —— 指向你自部署的 ip-radar(默认 `http://127.0.0.1:8000`)
- **IP Radar API key** —— 新版 server 对跨源程序化查询要求 Bearer key:浏览器打开 `{serverUrl}/admin` → API Keys → 签发后粘贴到此处(旧版无鉴权 server 不填也可用)
- **AbuseIPDB API key** —— 免费额度 1000 次/天,在 [abuseipdb.com/account/api](https://www.abuseipdb.com/account/api) 申请
- 快捷键、单次最大查询数、语言、源开关、开机自启等均可在设置中调整

### 已知限制

- 终端与内嵌终端(如 VSCode 终端)请先复制再按热键(模拟复制在这些场景不可靠)

### 从源码构建

```bash
# Linux 依赖
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

npm ci
npm run tauri build
```

### 许可

[AGPL-3.0](LICENSE)。主项目 [IP Radar](https://github.com/steponeerror/ip-radar) 同许可。

## English

**The official desktop companion for IP Radar.** Lives in your tray: press the global hotkey (`Ctrl/Cmd+Alt+I`) → IPs on your clipboard are read automatically → multiple sources are queried in parallel → a popup shows the full profile. Your at-hand IP intelligence entry for security operations.

- **Clipboard-to-verdict** — copy an IP (or a whole list, cap configurable), press the hotkey, results appear — no pasting, no confirmation
- **Selection lookup (Windows only)** — no copying needed: select text and press the hotkey; the selection is captured and queried first, falling back to the clipboard when it holds no IPs
- **Parallel multi-source** — queries your self-hosted [IP Radar](https://github.com/steponeerror/ip-radar) server (verdict / confidence / geo / ASN / per-classification evidence) alongside [AbuseIPDB](https://www.abuseipdb.com/) cloud reputation; sources are isolated — one failing never blocks the other
- **Pluggable sources** — adding a query source is dropping one file into `src/sources/`, zero registration code
- **Batch lookups** — a list of IPs copied from logs or alerts is queried in one shot; compact rows expand into full detail views with verdict badges
- **Cross-platform** — Linux / macOS / Windows builds, lightweight (Tauri 2)

<p align="center">
  <img src="assets/detail.png" alt="Expanded IP detail — source cards with evidence">
</p>

### Install

**macOS — Homebrew recommended**

```bash
brew install --cask steponeerror/ipradar/ip-radar-desktop
```

To update: `brew upgrade --cask ip-radar-desktop`. Apple Silicon (arm64) Macs only.

Fallback: download the `.dmg` directly from [Releases](../../releases). The app is unsigned — use at your own risk; before first run:

```bash
xattr -cr "/Applications/IP Radar Desktop.app"
```

(or right-click the app → Open)

**Windows**

Download the portable `.exe` (no installer, double-click to run) from [Releases](../../releases). Unsigned — when SmartScreen says "Windows protected your PC", choose "More info → Run anyway".

**Linux**

No packages yet — [build from source](#build-from-source).

### Configuration

Open settings (gear icon, top right):

- **Server URL** — points to your self-hosted ip-radar (default `http://127.0.0.1:8000`)
- **IP Radar API key** — newer servers require a Bearer key for cross-origin programmatic queries: open `{serverUrl}/admin` in a browser → API Keys → issue one and paste it here (older servers without auth work with no key)
- **AbuseIPDB API key** — free tier is 1,000 checks/day, apply at [abuseipdb.com/account/api](https://www.abuseipdb.com/account/api)
- Hotkey, max IPs per query, language, source toggles and autostart are all configurable

### Known limitations

- In terminals and embedded terminals (e.g. the VSCode terminal), copy first and then press the hotkey (simulated copy is unreliable there)

### Build from source

```bash
# Linux deps
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

npm ci
npm run tauri build
```

### License

[AGPL-3.0](LICENSE). Same license as the main project [IP Radar](https://github.com/steponeerror/ip-radar).
