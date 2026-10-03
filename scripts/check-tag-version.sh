#!/usr/bin/env bash
# Keep release tags, desktop metadata and Chrome extension metadata aligned.
set -euo pipefail
node --input-type=module - "${1:?Usage: check-tag-version.sh <tag>}" <<'JS'
import {readFileSync} from 'node:fs';
const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
const expected = tag.slice(1);
for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'extension/package.json', 'extension/package-lock.json', 'extension/public/manifest.json']) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  // Chrome manifest version cannot contain a prerelease suffix.
  const version = file.endsWith('manifest.json') ? expected.split('-')[0] : expected;
  if (data.version !== version || (data.packages && data.packages[''].version !== version)) {
    throw new Error(`${file}: expected ${version}, found ${data.version}`);
  }
  console.log(`${file}: ${version}`);
}
JS
