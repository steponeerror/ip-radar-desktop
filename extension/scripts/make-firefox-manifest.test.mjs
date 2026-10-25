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
  const { background, browser_specific_settings, version, ...rest } = fx;
  const { background: chromeBackground, version: chromeVersion, ...chromeRest } = chrome;
  expect(version).toBe(chromeVersion === "0.1.24" ? "0.1.24.1" : chromeVersion);
  expect(rest).toEqual(chromeRest);
});

test("Firefox signing revision applies only to the rebuilt release", () => {
  expect(firefoxManifest({version:"0.1.24"}).version).toBe("0.1.24.1");
  expect(firefoxManifest({version:"0.1.25"}).version).toBe("0.1.25");
});
