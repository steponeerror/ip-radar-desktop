// Firefox manifest 从 Chrome 版派生:单一事实源 public/manifest.json,不双维护
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const GECKO_ID = "ip-radar-extension@steponeerror.github.io";

export function firefoxManifest(manifest) {
  return {
    ...manifest,
    // Firefox MV3 用事件页(background.scripts),不支持 service_worker;type:module 必须
    // 保留:background.js 与 index 共享 rollup 代码分块,顶层有 import
    background: { scripts: ["background.js"], type: "module" },
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: "127.0" }, // 127 = optional_host_permissions
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
  await writeFile(
    "dist/manifest.json",
    JSON.stringify(firefoxManifest(manifest), null, 2) + "\n",
  );
  console.log(`dist/manifest.json → Firefox (gecko id ${GECKO_ID})`);
}
