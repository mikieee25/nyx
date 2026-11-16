import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GameFolder } from "@/features/library/types";

export { isTauri };

export function scanGames() {
  return invoke<GameFolder[]>("scan_games");
}

export function launchGame(executablePath: string) {
  return invoke<void>("launch_game", { executablePath });
}
