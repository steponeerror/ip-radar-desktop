# macOS DMG repair verification

Tested on 2026-10-02, Apple Silicon, macOS 26.5.2.

## Root cause

The supplied `IP.Radar.Desktop_0.1.14_aarch64.dmg` passes `hdiutil verify`.
Its app fails `codesign --verify --deep --strict` with:

```text
code has no resources but signature indicates they must be present
```

`codesign -dvvv` reports `adhoc,linker-signed`, `Info.plist=not bound`, and
`Sealed Resources=none`. The release configuration did not request signing of
the completed app bundle. The executable's linker signature is insufficient
for the packaged app.

The macOS overlay now requests ad-hoc signing of the complete app. Release
uploads run only after checksum and packaged-app signature verification.
The PR workflow builds and verifies a real DMG, and exercises the verifier
against unsealed, correctly sealed, and tampered native fixture apps.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 91 tests passed in 14 files |
| `npm run build` | Passed; existing mixed static/dynamic import warning remains |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 3 tests passed |
| `npm run tauri build -- --bundles dmg` | Passed; complete app signed with identity `-` |
| `bash scripts/test-macos-dmg-validation.sh` | All 3 cases passed: unsealed rejected, sealed accepted, tampered rejected |
| Verifier against supplied original DMG | Correctly rejected with the resource signature error, exit 1 |
| Verifier against rebuilt DMG | Passed checksum and strict/deep app verification, exit 0 |
| Rebuilt app signature metadata | Identifier `com.ipradar.desktop`; Info.plist bound; sealed resources v2 |
| Launch from mounted rebuilt DMG using `open` | Succeeded; app process observed running |
| `spctl --assess --type execute --verbose=4` | Rejected: ad-hoc build has no Developer ID / Apple notarization |
| User manual launch / UI acceptance | Pending |

Local test artifact: `dist/verification/IP.Radar.Desktop_0.1.14_aarch64-fixed.dmg`.
SHA-256:

```text
1f9ed0622d2bac39694cee6a93d97f6252cb373ccee25eb95ef446af97014729
```

This fixes bundle signature integrity, not Apple trust. Local launch success
does not prove that a browser-downloaded, quarantined copy will launch without
an exception. No quarantine attributes were removed and Gatekeeper was not
disabled during these checks. Developer ID signing and Apple notarization
remain necessary for distribution without a manual Gatekeeper exception.
See the [Tauri signing guide](https://v2.tauri.app/distribute/sign/macos/).

The original DMG and generated artifacts are not committed. A pull request to
`master` is deferred until the user confirms manual launch succeeds.
