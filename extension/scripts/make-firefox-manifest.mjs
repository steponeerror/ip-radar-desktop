// Firefox manifest 从 Chrome 版派生:单一事实源 public/manifest.json,不双维护
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { GECKO_ID, UPDATE_URL } from "./firefox-updates.mjs";

export function firefoxManifest(manifest) {
  return {
    ...manifest,
    // v0.1.24 was already signed before its draft was removed. Rebuilt bytes need a new AMO version.
    version: manifest.version === "0.1.24" ? "0.1.24.2" : manifest.version,
    // Firefox MV3 用事件页(background.scripts),不支持 service_worker;type:module 必须
    // 保留:background.js 与 index 共享 rollup 代码分块,顶层有 import
    background: { scripts: ["background.js"], type: "module" },
    browser_specific_settings: {
      gecko_android: { strict_min_version: "142.0" },
      gecko: {
        id: GECKO_ID,
        update_url: UPDATE_URL,
        strict_min_version: "140.0",
        // Queries transmit IP addresses and API credentials to the chosen providers.
        data_collection_permissions: {
          required: ["personallyIdentifyingInfo", "authenticationInfo"],
        },
      },
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
  await writeFile(
    "dist-firefox/manifest.json",
    JSON.stringify(firefoxManifest(manifest), null, 2) + "\n",
  );
  console.log(`dist-firefox/manifest.json → Firefox (gecko id ${GECKO_ID})`);
}
