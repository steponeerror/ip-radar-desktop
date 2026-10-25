import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export function scopeFor(files) {
  let extension = false, desktop = false;
  for (const file of files) {
    if (/^(docs\/|\.agents\/|\.github\/release-notes\.md$)/.test(file) || /\.md$/.test(file)) continue;
    if (file.startsWith("extension/")) extension = true;
    else if (file === ".github/workflows/release.yml") continue;
    else if (file.startsWith("src-tauri/")) desktop = true;
    else { extension = true; desktop = true; }
  }
  return { extension, desktop };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2);
  let scope;
  if (!base || /^0+$/.test(base)) scope = { extension: true, desktop: true };
  else {
    const files = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, head || "HEAD", "--"], { encoding: "utf8" }).split("\0").filter(Boolean);
    scope = scopeFor(files);
  }
  for (const [name, enabled] of Object.entries(scope)) console.log(`${name}=${enabled}`);
}
