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
- On macOS only, pass --background for newly registered autostarts to retain background launch.
- On macOS only, handle tray left-button release once, instead of both press and release.
- On macOS only, report window activation errors rather than silently ignoring them.

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

## Platform scope (2026-10-03)

All new runtime behavior is compile-gated with `#[cfg(target_os = "macos")]`.
Windows and Linux keep the original independent unminimize/show/focus calls,
no autostart arguments, both tray left-button events, and Builder::run path.
The macOS Ready/Reopen callback is not compiled on other platforms.
