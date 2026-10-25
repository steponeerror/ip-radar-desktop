import { stripTag } from "../../src/version";
export function hasExtensionAsset(assets: unknown, tag: string, channel: string | undefined) {
  if (!Array.isArray(assets)) return false;
  const firefox = channel === "firefox";
  const base = `IP.Radar.${firefox ? "Firefox" : "Chrome"}_v${stripTag(tag)}`;
  return assets.some((asset) => asset?.name === `${base}.zip` || (firefox && asset?.name === `${base}.xpi`));
}
