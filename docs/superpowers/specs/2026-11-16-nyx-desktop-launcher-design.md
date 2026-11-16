# Nyx Desktop Game Launcher Design

## Goal

Turn `game_launcher.html` into Nyx, a Windows-only local game launcher packaged as a Tauri 2 desktop app. Keep its dark glass look, ambient backdrop, and 3D carousel. Use Next.js, HeroUI, and GSAP for the interface and animations. `D:\Games` is the library root.

## Product scope

- Scan `D:\Games` for game folders and local executable candidates. Treat each first-level folder as one game; let the user select its launch executable when a folder contains several candidates.
- Persist executable choices, favorites, and recently played state locally.
- Launch only executables validated to be inside `D:\Games`.
- Support mouse, keyboard, and connected gamepads. Gamepad navigation covers library browsing, focus, confirm, back, and launch.
- Keep search, library filters, favorites, recent games, and local game details where they fit the current visual design.
- Remove sample games and simulated download, friend, invite, account, and store behavior. Any online-themed visuals that remain are inert decoration; no network requests or accounts.
- Show clear scanning, empty-library, missing-drive, invalid-executable, and launch-error states.

## Design direction

Keep the existing dark glass panels, low-light ambient art, cyan/violet accents, and cinematic carousel/hero composition. Rebuild the current large single-file DOM interactions as React components with HeroUI primitives for controls and dialogs. Use GSAP for focused carousel, backdrop, and panel transitions; respect reduced-motion preferences and keep navigation responsive while animations run. Use a root-level `cover` or `folder` PNG/JPEG/WebP from each game directory when available, and a bundled fallback otherwise.

Decorative online controls should be removed or repurposed for local information such as library location, scan status, and controller status. They must not imply working online services.

## Audio and startup

- Add original, restrained console-style cues for navigation, confirmation, back/close, and launching. Aim for a crisp, futuristic feel; do not reuse or imitate proprietary PS5 recordings or melodies.
- Keep audio local and optional, with a visible mute control and saved preference. Use the browser's local Web Audio API after audio is enabled by user interaction; do not load an audio library or sound from a CDN.
- Play a brief, skippable startup animation on launch: reveal the Nyx icon, add a short light/glow treatment, then transition into the library. Keep it around two seconds, allow any controller/keyboard confirm to skip, and honor reduced-motion preferences.
- Pair the intro with one short original sonic cue when audio is enabled. If startup audio is blocked before user interaction, continue the visual intro silently and enable audio cues after the first interaction.
- No full-screen video file or network-hosted movie is needed; the intro is a lightweight GSAP animation using the app icon.

`Nyx icon.png` is the approved app icon source: a cyan-indigo crescent holding a four-way gamepad D-pad on a dark navy tile. Use it for the startup animation and generate the required Tauri icon assets from it before packaging. The existing lightning mark remains part of the current UI reference only.

## Architecture

- **Frontend:** Next.js App Router using static export for Tauri's bundled web assets. Keep all runtime UI local; no server deployment or runtime network dependency.
- **UI:** HeroUI for accessible controls and dialogs, with a shared dark theme. GSAP owns only the presentation transitions; React owns application state.
- **Desktop shell:** Tauri 2. Follow Helios's Windows NSIS installer and embedded WebView bootstrapper configuration. Do not copy Helios's download manager, updater, tray, or other unrelated plugins into Nyx.
- **Native boundary:** Narrow Tauri commands handle library scanning, executable validation, and process launch. Canonicalize paths and reject any launch target outside `D:\Games`. The frontend never invokes arbitrary shell commands.
- **Local state:** Store library mappings, favorites, and recent-play history on the device. No account or sync layer.
- **Assets and security:** Bundle CSS, fonts, scripts, icons, and fallbacks locally. Remove the current CDN dependencies (Tailwind CDN, Google Fonts, and Tone.js CDN) and use a restrictive production CSP compatible with Tauri IPC and local assets.

## Approaches considered

1. **Wrap the current HTML directly.** Fastest prototype, but keeps the large imperative script and makes controller focus, local state, and accessible UI harder to maintain.
2. **Rebuild the interface in Next.js, then bundle with Tauri (recommended).** Matches the selected stack and creates clear frontend/native boundaries; costs more initial conversion work.
3. **Use a remote Next.js app inside Tauri.** Rejected because Nyx is local-only and should work without a network connection.

## Initial flow

On startup, Nyx checks `D:\Games`, loads local library settings, and scans game folders. The library displays discovered folders using local artwork or a fallback. The user assigns an executable if needed, selects a game, and launches it. A rescan refreshes folders while preserving valid local settings. If the drive is unavailable, Nyx keeps the stored library visible where possible and explains that the library cannot currently be rescanned.

## Completion evidence

Before calling Nyx packaged, verify the static frontend build, Tauri Windows bundle, and installer launch on Windows. Manually check scanning against a sample library, rejection of executables outside `D:\Games`, launch failure feedback, gamepad navigation, sound mute/persistence, startup intro skip, and reduced-motion behavior. Do not claim production readiness without those checks.

## Assumptions

- The first release targets Windows only.
- Each immediate child folder of `D:\Games` represents one game; executable selection resolves per-game layout differences.
- Local game art is optional and may be absent.
- Existing online elements are visual reference only, never feature requirements.
