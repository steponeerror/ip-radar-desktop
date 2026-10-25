import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export const UPDATE_URL =
  "https://github.com/steponeerror/ip-radar-desktop/releases/latest/download/firefox-updates.json";
export const GECKO_ID = "ip-radar-extension@steponeerror.github.io";
export function firefoxUpdates(manifest, xpi, tag) {
  const gecko = manifest.browser_specific_settings?.gecko;
  if (gecko?.id !== GECKO_ID || gecko.update_url !== UPDATE_URL)
    throw new Error(
      "Signed XPI has an unexpected Firefox identity or update URL",
    );
  if (
    !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag) ||
    !/^\d+(\.\d+){2,3}$/.test(manifest.version) ||
    !(
      manifest.version === tag.slice(1).split("-")[0] ||
      manifest.version.startsWith(`${tag.slice(1).split("-")[0]}.`)
    )
  )
    throw new Error("Signed XPI version does not match the release tag");
  return {
    addons: {
      [GECKO_ID]: {
        updates: [
          {
            version: manifest.version,
            update_link: `https://github.com/steponeerror/ip-radar-desktop/releases/download/${tag}/IP.Radar.Firefox_${tag}.xpi`,
            update_hash: `sha512:${createHash("sha512").update(xpi).digest("hex")}`,
            applications: {
              gecko: { strict_min_version: gecko.strict_min_version },
            },
          },
        ],
      },
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [manifestPath, xpiPath, tag, output] = process.argv.slice(2);
  await writeFile(
    output,
    JSON.stringify(
      firefoxUpdates(
        JSON.parse(await readFile(manifestPath, "utf8")),
        await readFile(xpiPath),
        tag,
      ),
      null,
      2,
    ) + "\n",
  );
}
