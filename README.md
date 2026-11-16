# Nyx

Nyx is a local Windows game launcher. It reads `D:\Games`; every immediate child folder is one game. It searches those folders recursively for `.exe` files and checks the game folder root for optional `cover` or `folder` PNG/JPG/JPEG/WebP art (up to 2 MiB).

## Run and package

- `npm run dev` starts the browser preview. The preview cannot read `D:\Games`.
- `npm run tauri:dev` runs the desktop launcher with local drive access.
- `npm run tauri:build` creates the Windows NSIS installer at `src-tauri/target/release/bundle/nsis/Nyx_0.1.0_x64-setup.exe`.

The launcher makes no game-service or library network requests. The installer embeds the WebView2 bootstrapper; Windows may need an Internet connection during installation if WebView2 Runtime is not already installed.

## Controls

- Keyboard: Left/Right browses games; Up/Down moves focus; Tab and Enter activate controls; Escape returns to All Games.
- Controller: Left/Right browses; Up/Down moves focus; Confirm activates the focused control (or launches when none is focused); Start launches; Back resets filters.
- Interface sound can be muted from the header. Startup motion can be skipped and respects reduced-motion settings.
