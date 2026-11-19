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

export function scanGames(libraryRoots: string[]) {
  return invoke<GameFolder[]>("scan_games", { libraryRoots });
}

export function launchGame(executablePath: string, libraryRoots: string[]) {
  return invoke<void>("launch_game", { executablePath, libraryRoots });
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
  libraryRoots: string[],
) {
  return invoke<void>("download_sgdb_artwork", {
    gamePath,
    gameId,
    artworkId,
    libraryRoots,
  });
}
