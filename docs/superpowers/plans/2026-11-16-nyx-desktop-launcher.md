# Nyx Desktop Game Launcher Implementation Plan

> **For agentic workers:** Execute inline task-by-task with checkpoints. Keep each task scoped to the listed files and preserve the user’s existing HTML and icon assets.

**Goal:** Build Nyx as a Windows-only, offline-capable Tauri launcher for games under `D:\Games`, using the approved icon, controller navigation, and cinematic interface.

**Architecture:** A Next.js App Router frontend is statically exported into Tauri’s WebView. HeroUI v3 provides accessible controls; GSAP handles UI, carousel, and startup transitions. Small Rust commands scan the fixed local library and launch only validated executables within it.

**Tech Stack:** Next.js, React, TypeScript, HeroUI v3, Tailwind CSS v4, GSAP 3 with `@gsap/react`, Tauri 2, Rust, Tauri Store plugin.

**Spec:** `docs/superpowers/specs/2026-11-16-nyx-desktop-launcher-design.md`

## Global Constraints

- First release targets Windows only.
- The library root is `D:\Games`; each immediate child directory represents one game.
- Only launch `.exe` files that canonicalize within `D:\Games`.
- Keep UI, sounds, fonts, scripts, and artwork local at runtime; make no network requests.
- Online-looking UI is decorative and has no account, social, store, or download behavior.
- Use the approved crescent/D-pad `Nyx icon.png` as the app icon and startup animation source.
- Build a Tauri 2 Windows NSIS installer with the embedded WebView bootstrapper.
- Keep Rust responsibilities narrow; the frontend cannot execute arbitrary shell commands.
- Preserve keyboard and mouse use when adding gamepad controls.
- Honor reduced-motion preferences and permit skipping the startup sequence.

---

## File map

- `package.json`, `package-lock.json`: scripts and frontend dependencies.
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`: static export and build configuration.
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`: app shell, theme tokens, and root route.
- `src/features/library/types.ts`: shared library and preference types.
- `src/features/library/LibraryScreen.tsx`: UI state orchestration and root screen.
- `src/features/library/components/*`: header, game carousel/cards, hero details, scan/empty/error states, and executable picker.
- `src/lib/tauri.ts`: typed wrappers for the Tauri commands.
- `src/lib/preferences.ts`: typed persistence for selected executables, favorites, recents, and sound preference.
- `src/lib/gamepad.ts`: controller input mapping and connect/disconnect state.
- `src/lib/audio.ts`: local Web Audio cues and mute preference integration.
- `src/lib/animations.ts`: startup and view-transition GSAP timelines.
- `public/nyx-icon.png`: app icon source copied from the approved project PNG.
- `src-tauri/Cargo.toml`, `build.rs`, `src/lib.rs`, `src/main.rs`: Tauri app and Windows-native commands.
- `src-tauri/tauri.conf.json`, `capabilities/default.json`: NSIS packaging, static frontend, CSP, and least-privilege plugin permissions.
- `src-tauri/icons/*`: Tauri-generated Windows app icon assets.

## Task 1: Scaffold Next.js, HeroUI, and Tauri

**Files:** Create the package/config files, `src/app/*`, and `src-tauri/*` listed in the file map. Modify no existing reference HTML.

1. Initialize a Next.js App Router TypeScript app in `D:\Codes\Nyx` using npm.
2. Install `@heroui/react`, `@heroui/styles`, Tailwind CSS v4, `gsap`, `@gsap/react`, `@tauri-apps/api`, `@tauri-apps/plugin-store`, and the Tauri CLI.
3. In `src/app/globals.css`, import Tailwind before HeroUI styles. Define semantic CSS variables for background, panel, text, muted text, accent, border, focus ring, spacing, and motion.
4. Set Next.js `output: 'export'` and use Tauri `frontendDist: '../out'`. Configure the Tauri dev URL and before-dev/build commands.
5. Initialize the Tauri 2 Rust shell, store plugin, app identifier `app.nyx.launcher`, window title `Nyx`, and Windows NSIS target with `embedBootstrapper`.
6. Add a strict local-only production CSP and a development CSP for the local Next dev server. Do not include remote origins.
7. Confirm `npm run build` produces `out/index.html` and `cargo check` succeeds before adding application behavior.

## Task 2: Rebuild the local launcher interface

**Files:** Create `src/features/library/types.ts`, `LibraryScreen.tsx`, and focused components under `src/features/library/components/`; update `src/app/page.tsx` and `globals.css`.

**Interfaces:**

```ts
export type ExecutableCandidate = { path: string; name: string };
export type GameFolder = { path: string; name: string; coverDataUrl: string | null; executables: ExecutableCandidate[] };
export type GamePreferences = {
  executableByGame: Record<string, string>;
  favorites: string[];
  recent: string[];
  soundEnabled: boolean;
};
```

1. Convert the HTML’s dark glass, ambient background, cyan-indigo accents, carousel, and hero details into React components styled with the shared semantic tokens and HeroUI controls.
2. Remove sample game data, friend/download drawers, invites, store/account controls, and simulation toasts. Replace them with library path, scan status, controller status, and useful local actions.
3. Render explicit `scanning`, `ready`, `empty`, and `error` states. Keep the empty library helpful and do not show fabricated games.
4. Implement search, all/installed/favorites/recent filters, favorite toggling, game details, and executable assignment UI.
5. Use a bundled/system font strategy. No runtime CDN assets, remote cover art, or runtime fetches.
6. Keep component responsibilities narrow: `LibraryScreen` owns state and transitions; cards, filters, dialogs, and status surfaces receive typed props.

## Task 3: Implement safe Windows library scan and launch

**Files:** Create `src-tauri/src/library.rs`; modify `src-tauri/src/lib.rs` and `src-tauri/Cargo.toml`.

**Interfaces:**

```rust
#[derive(serde::Serialize)]
struct ExecutableCandidate { path: String, name: String }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GameFolder { path: String, name: String, cover_data_url: Option<String>, executables: Vec<ExecutableCandidate> }

#[tauri::command]
fn scan_games() -> Result<Vec<GameFolder>, String>;

#[tauri::command]
fn launch_game(executable_path: String) -> Result<(), String>;
```

1. Resolve the fixed root `D:\Games`; return an explicit error when it is missing or unreadable.
2. Enumerate immediate child directories as games. Recursively find `.exe` candidates without following directory symlinks; ignore non-files and compare extensions case-insensitively.
3. Look only in each game folder root for `cover` or `folder` PNG/JPEG/WebP files. Accept files up to 2 MiB, read them as local data URLs, and return `None` when no supported artwork exists.
4. Return paths, display names, optional cover data, and executable candidates only; do not execute files during scanning.
5. In `launch_game`, canonicalize both the root and selected executable, ensure the executable is a regular `.exe` beneath the canonical root, set its parent as the working directory, and spawn it with no shell.
6. Convert filesystem and spawn errors into actionable command errors. Register only `scan_games` and `launch_game` with Tauri.
7. Manually check missing-root behavior and reject a path outside `D:\Games` before connecting the UI.

## Task 4: Connect library state and local persistence

**Files:** Create/update `src/lib/tauri.ts`, `src/lib/preferences.ts`, and `LibraryScreen.tsx`; update `src-tauri/capabilities/default.json`.

**Interfaces:**

```ts
export function scanGames(): Promise<GameFolder[]>;
export function launchGame(executablePath: string): Promise<void>;
export function loadPreferences(): Promise<GamePreferences>;
export function savePreferences(value: GamePreferences): Promise<void>;
```

1. Implement narrow `invoke` wrappers and centralize error normalization for scan and launch failures.
2. Persist `GamePreferences` in a Tauri Store file in the app data directory. Grant only the store permissions required to load, read, write, and save values.
3. On startup, load preferences, scan `D:\Games`, preserve saved choices that still exist, and display a recovery message for stale paths.
4. Select the executable automatically only when a game has one candidate. If there are multiple, require a user choice. If none exist, show an explanatory state.
5. Update favorites and recent history only after successful local actions; cap recent history at the latest 20 games.
6. Surface missing drive, scan failures, invalid selection, and launch failures in the UI without silently replacing them with an empty library.

## Task 5: Add gamepad, sound, and startup motion

**Files:** Create `src/lib/gamepad.ts`, `audio.ts`, and `animations.ts`; update `LibraryScreen.tsx`, the header, carousel, `layout.tsx`, and `globals.css`.

1. Use the browser Gamepad API in a client-only hook. Map the standard D-pad/stick to focus and carousel movement, primary face button to confirm/launch, secondary face button to back, and Start to launch the selected game. Edge-detect button presses so a held button does not repeat actions.
2. Keep visible focus, mouse, and keyboard support. Announce controller connection state and use generic confirm/back prompts where controller labels vary.
3. Generate short original navigation, confirm, back, and launch tones with Web Audio oscillators and envelopes. Initialize audio only after a user gesture; persist mute state and keep all cues optional.
4. Add a skippable ~2-second GSAP startup timeline centered on `public/nyx-icon.png`: reveal, restrained glow, transition into the library. Skip on confirm/Enter/Space; use reduced motion to bypass or collapse the animation.
5. Use `@gsap/react` cleanup/context scoping so component changes and unmounts revert animations cleanly. Prevent animation lockout of input.
6. Manually check keyboard/gamepad parity, connect/disconnect, held-button behavior, mute persistence, startup skip, and reduced-motion behavior.

## Task 6: Generate icons and package the Windows installer

**Files:** Copy `Nyx icon.png` to `public/nyx-icon.png`; generate `src-tauri/icons/*`; finalize `src-tauri/tauri.conf.json` and package scripts.

1. Run the Tauri CLI icon generator against `Nyx icon.png`; retain transparent corners and include the Windows `.ico` plus PNG sizes listed in Tauri config.
2. Confirm the desktop window uses the generated icon, product name `Nyx`, and the approved window dimensions/minimums from the visual implementation.
3. Configure NSIS and the embedded WebView bootstrapper. Do not add Helios’s updater, shell, download, deep-link, or tray plugins.
4. Build the static frontend and Tauri bundle. Confirm the installer builds and launches on Windows without a runtime network connection.
5. Manually verify scan/launch against a safe sample library, outside-root rejection, launch-error feedback, keyboard/gamepad interaction, audio preferences, startup animation, and missing `D:\Games` behavior.

## Official references

- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports)
- [Tauri + Next.js](https://v2.tauri.app/start/frontend/nextjs/)
- [Tauri app icons](https://v2.tauri.app/develop/icons/)
- [HeroUI quick start](https://heroui.com/en/docs/react/getting-started/quick-start)
- [Tauri Store plugin](https://v2.tauri.app/plugin/store/)
- [GSAP installation and React](https://gsap.com/docs/v3/Installation/)
