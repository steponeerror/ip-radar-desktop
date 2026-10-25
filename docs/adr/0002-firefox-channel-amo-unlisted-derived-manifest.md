# Firefox 通道经 AMO unlisted 签名分发,manifest 构建期派生

Chrome 与 Firefox 共用 `extension/` 同一套代码,`public/manifest.json` 是唯一 manifest 事实源(Chrome 版原样);Firefox 版由 `scripts/make-firefox-manifest.mjs` 在构建时派生 `dist-firefox/manifest.json`:background 以事件页 `scripts` 取代 `service_worker`(`type: module` 必须保留——background.js 与 index 共享 rollup 代码分块,顶层有 import),并加入 `browser_specific_settings.gecko`(id=`ip-radar-extension@steponeerror.github.io`,strict_min_version=140,支持内建数据传输同意界面;gecko_android 最低 142)。发行走 AMO unlisted 自签名(免费,不公开上架):`web-ext sign` 产物 xpi 直接分发,unlisted 重新签名不触发 AMO 自动更新;当前未配置 update_url,使用者需下载已签名 XPI 手动更新。未来自动更新需独立托管 HTTPS 更新清单与签名 XPI。manifest 声明查询 IP 与 API 凭证传输的数据权限。CI 仅生成未签名 ZIP,签名与 XPI 发布另行进行。唯一不可逆点:gecko id 首次签名后即为 AMO 永久身份,换 id 等于发布一个新扩展。

## Considered Options

- 未签名 zip + `about:debugging` 临时加载 — 否决:重启即失,日常自用不可接受。
- 单 manifest 双写 background(`service_worker`+`scripts` 并存)— 否决:Chrome 侧产生未知键告警,公共 manifest 混入通道细节;派生保 Chrome 版零污染。

Chrome 输出保留在 dist,Firefox 输出到独立 dist-firefox。打包使用锁定版本 web-ext,不依赖 POSIX shell 或系统 zip。
