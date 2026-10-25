import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { firefoxManifest } from "./make-firefox-manifest.mjs";

test("firefox manifest derives from the chrome manifest", () => {
  const chrome = JSON.parse(
    readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"),
  );
  const fx = firefoxManifest(chrome);
  expect(fx.background).toEqual({ scripts: ["background.js"], type: "module" });
  expect(fx.browser_specific_settings.gecko).toEqual({
    id: "ip-radar-extension@steponeerror.github.io",
    strict_min_version: "140.0",
    data_collection_permissions: {
      required: ["personallyIdentifyingInfo", "authenticationInfo"],
    },
  });
  // 除 background/gecko 外逐字段继承 Chrome manifest:权限/图标/popup 不双维护
  const { background, browser_specific_settings, ...rest } = fx;
  const { background: chromeBackground, ...chromeRest } = chrome;
  expect(rest).toEqual(chromeRest);
});
