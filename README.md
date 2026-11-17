# Nyx

Nyx is a local Windows game launcher. It reads `D:\Games`; every immediate child folder is one game. It searches those folders recursively for `.exe` files and local artwork named `cover`, `poster`, `artwork`, `banner`, or `folder` (PNG/JPG/JPEG/WebP, up to 8 MiB) in the game folder or its `covers`, `art`, `artwork`, `images`, or `media` folder. You can also search SteamGridDB from a selected game's artwork picker; chosen covers are cached in Nyx's app data and stored in the Windows Credential Manager with your API key. Nyx uses cached or local artwork offline and falls back to the first game executable's Windows icon.

## Run and package

- `npm run dev` starts the browser preview. The preview cannot read `D:\Games`.
- `npm run tauri:dev` runs the desktop launcher with local drive access.
- `npm run tauri:build` creates the Windows NSIS installer at `src-tauri/target/release/bundle/nsis/Nyx_0.1.0_x64-setup.exe`.

Nyx only contacts SteamGridDB when you search for or download artwork. Game scanning, preferences, and launching stay local, and cached covers work offline. The installer embeds the WebView2 bootstrapper; Windows may need an Internet connection during installation if WebView2 Runtime is not already installed.

## Controls

- Keyboard: Left/Right browses games; Up/Down moves focus; Tab and Enter activate controls; Escape returns to All Games.
- Controller: Left/Right browses; Up/Down moves focus; Confirm activates the focused control (or launches when none is focused); Start launches; Back resets filters.
- Interface sound can be muted from the header. Startup motion can be skipped and respects reduced-motion settings.
