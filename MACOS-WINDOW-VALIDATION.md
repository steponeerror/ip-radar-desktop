# macOS window activation repair

Tested on Apple Silicon / macOS 26.5.2, 2026-10-02.

The release started with a hidden main window and did not handle macOS
`RunEvent::Reopen`. Finder/Dock reopening an existing application does not
necessarily create a second process, so the single-instance callback alone
cannot handle that path. Resetting persisted window geometry did not resolve
the user-reported failure.

Changes:
- Show the main window on macOS Ready for manual launches.
- Handle macOS Reopen and unhide the application before showing/focusing it.
- Pass --background for newly registered autostarts to retain background launch.
- Handle tray left-button release once, instead of both press and release.
- Report window activation errors rather than silently ignoring them.

Validation:
- Three existing Rust tests passed; frontend and release build passed.
- Packaged DMG checksum and strict/deep app signature verification passed.
- Launched the final release app through macOS application launch: accessibility
  tree exposed the IP input, query and settings controls; screenshot confirmed
  the main window visibly rendered.
- User installation confirmation remains pending. Login-time autostart and
  Windows/Linux runtime behavior have not been manually tested in this change.

The application in /Applications remains the published 0.1.15 build. The
running test app is in src-tauri/target/release/bundle/macos. The candidate DMG
is dist/verification/IP.Radar.Desktop_0.1.15_window-fix_aarch64.dmg; it is not a
new published release. No Apple notarization was added.
