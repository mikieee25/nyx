import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GameFolder } from "@/features/library/types";

export type SteamGridDBGame = { id: number; name: string; verified: boolean };
export type SteamGridDBArtwork = {
  id: number;
  name: string;
  dimensions: string;
  thumb: string;
};

export { isTauri };

export function scanGames() {
  return invoke<GameFolder[]>("scan_games");
}

export function launchGame(executablePath: string) {
  return invoke<void>("launch_game", { executablePath });
}

export function hasSteamGridDBKey() {
  return invoke<boolean>("has_sgdb_api_key");
}

export function saveSteamGridDBKey(apiKey: string) {
  return invoke<void>("set_sgdb_api_key", { apiKey });
}

export function clearSteamGridDBKey() {
  return invoke<void>("clear_sgdb_api_key");
}

export function searchSteamGridDBGames(query: string) {
  return invoke<SteamGridDBGame[]>("search_sgdb_games", { query });
}

export function searchSteamGridDBArtwork(gameId: number) {
  return invoke<SteamGridDBArtwork[]>("search_sgdb_artwork", { gameId });
}

export function downloadSteamGridDBArtwork(
  gamePath: string,
  gameId: number,
  artworkId: number,
) {
  return invoke<void>("download_sgdb_artwork", { gamePath, gameId, artworkId });
}
