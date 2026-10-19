# Firefox 通道经 AMO unlisted 签名分发,manifest 构建期派生

Chrome 与 Firefox 共用 `extension/` 同一套代码,`public/manifest.json` 是唯一 manifest 事实源(Chrome 版原样);Firefox 版由 `scripts/make-firefox-manifest.mjs` 在构建时派生 `dist/manifest.json`:background 以事件页 `scripts` 取代 `service_worker`(`type: module` 必须保留——background.js 与 index 共享 rollup 代码分块,顶层有 import),并加入 `browser_specific_settings.gecko`(id=`ip-radar-extension@steponeerror.github.io`,strict_min_version=127,即 optional_host_permissions 的支持门槛)。发行走 AMO unlisted 自签名(免费,不公开上架):`web-ext sign` 产物 xpi 直接分发,新版本重复上传签名后,已安装者由 AMO 更新服务自动更新。唯一不可逆点:gecko id 首次签名后即为 AMO 永久身份,换 id 等于发布一个新扩展。

## Considered Options

- 未签名 zip + `about:debugging` 临时加载 — 否决:重启即失,日常自用不可接受。
- 单 manifest 双写 background(`service_worker`+`scripts` 并存)— 否决:Chrome 侧产生未知键告警,公共 manifest 混入通道细节;派生保 Chrome 版零污染。
