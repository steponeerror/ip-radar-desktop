import { readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { firefoxManifest } from "./make-firefox-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(script, args, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root, env, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Firefox build failed (${result.status})`);
}
if (!process.env.npm_execpath) throw new Error("Run through npm run build:firefox");
run(process.env.npm_execpath, ["run", "build", "--", "--outDir", "dist-firefox"], {
  ...process.env, VITE_CHANNEL: "firefox",
});
const source = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
await writeFile(new URL("../dist-firefox/manifest.json", import.meta.url), JSON.stringify(firefoxManifest(source), null, 2) + "\n");
run(fileURLToPath(new URL("../node_modules/web-ext/bin/web-ext.js", import.meta.url)), [
  "build", "--source-dir", "dist-firefox", "--artifacts-dir", ".",
  "--filename", `IP.Radar.Firefox_v${source.version}.zip`, "--overwrite-dest",
]);

// web-ext normalizes archive names to lowercase; Release asset matching is case-sensitive.
const filename = `IP.Radar.Firefox_v${source.version}.zip`;
await rename(new URL(`../${filename.toLowerCase()}`, import.meta.url), new URL(`../${filename}`, import.meta.url));
console.log(`Firefox release asset: ${filename}`);
