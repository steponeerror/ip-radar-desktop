import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { firefoxManifest } from "./make-firefox-manifest.mjs";
import { firefoxUpdates, GECKO_ID } from "./firefox-updates.mjs";
test("update entry uses the signed Firefox version and exact package digest", () => {
  const bytes = Buffer.from("signed package");
  const manifest = firefoxManifest({ version: "0.1.24" });
  const update = firefoxUpdates(manifest, bytes, "v0.1.24").addons[GECKO_ID]
    .updates[0];
  expect(update.version).toBe("0.1.24.2");
  expect(update.update_link).toBe(
    "https://github.com/steponeerror/ip-radar-desktop/releases/download/v0.1.24/IP.Radar.Firefox_v0.1.24.xpi",
  );
  expect(update.update_hash).toBe(
    `sha512:${createHash("sha512").update(bytes).digest("hex")}`,
  );
  expect(update.applications.gecko.strict_min_version).toBe("140.0");
});
test("rejects wrong package identities, versions, and invalid tags", () => {
  const manifest = firefoxManifest({ version: "0.1.25" });
  for (const tag of ["v0.1.24", "v0.1.25/evil", "bad"])
    expect(() => firefoxUpdates(manifest, Buffer.from(""), tag)).toThrow();
  expect(() =>
    firefoxUpdates(
      { ...manifest, browser_specific_settings: {} },
      Buffer.from(""),
      "v0.1.25",
    ),
  ).toThrow();
});
