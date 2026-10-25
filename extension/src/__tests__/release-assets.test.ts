import { expect, it } from "vitest";
import { hasExtensionAsset } from "../release-assets";
it("requires the matching version and browser, allowing signed Firefox XPI", () => {
  const chrome = [{name:"IP.Radar.Chrome_v0.1.22.zip"}];
  const firefox = [{name:"IP.Radar.Firefox_v0.1.22.zip"}];
  expect(hasExtensionAsset(chrome, "v0.1.22", undefined)).toBe(true);
  expect(hasExtensionAsset(chrome, "v0.1.22", "firefox")).toBe(false);
  expect(hasExtensionAsset(firefox, "v0.1.22", undefined)).toBe(false);
  expect(hasExtensionAsset(firefox, "v0.1.22", "firefox")).toBe(true);
  expect(hasExtensionAsset(firefox, "v0.1.23", "firefox")).toBe(false);
  expect(hasExtensionAsset([{name:"IP.Radar.Firefox_v0.1.22.xpi"}], "0.1.22", "firefox")).toBe(true);
  expect(hasExtensionAsset([null, {}, {name:42}], "v0.1.22", "firefox")).toBe(false);
  expect(hasExtensionAsset(null, "v0.1.22", "firefox")).toBe(false);
});
