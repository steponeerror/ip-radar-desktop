import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeFor } from "./ci-scope.mjs";
test("extension changes do not trigger desktop builds", () => {
  assert.deepEqual(scopeFor(["extension/src/styles.css", "extension/package-lock.json"]), {extension:true, desktop:false});
});
test("shared code and test workflow changes retain both suites", () => {
  for (const file of ["shared/intelligence.ts", "src/version.ts", ".github/workflows/test.yml", "scripts/ci-scope.mjs", "package-lock.json"])
    assert.deepEqual(scopeFor([file]), {extension:true, desktop:true});
});
test("native and documentation changes are scoped correctly, including mixed changes", () => {
  assert.deepEqual(scopeFor(["src-tauri/src/main.rs"]), {extension:false, desktop:true});
  assert.deepEqual(scopeFor(["README.md", ".github/workflows/release.yml"]), {extension:false, desktop:false});
  assert.deepEqual(scopeFor(["src-tauri/src/main.rs", "extension/src/client.ts"]), {extension:true, desktop:true});
});
test("removed paths and extension code renamed into docs still require extension tests", () => {
  // The CLI uses --no-renames so both the removed and added path are classified.
  assert.deepEqual(scopeFor(["extension/src/removed.ts", "docs/removed.md"]), {extension:true, desktop:false});
});
