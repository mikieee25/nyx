import { load } from "@tauri-apps/plugin-store";
import {
  DEFAULT_PREFERENCES,
  type GamePreferences,
} from "@/features/library/types";

const STORE_NAME = "nyx-settings.json";
const STORE_KEY = "preferences";
let saveQueue: Promise<void> = Promise.resolve();

export async function loadPreferences(): Promise<GamePreferences> {
  const store = await load(STORE_NAME, {
    defaults: { [STORE_KEY]: DEFAULT_PREFERENCES },
    autoSave: true,
  });
  const value = await store.get<unknown>(STORE_KEY);
  if (value === undefined) return { ...DEFAULT_PREFERENCES };
  if (!value || typeof value !== "object")
    throw new Error("Nyx settings are not a valid preferences object.");
  const candidate = value as Partial<GamePreferences>;
  const mappings = candidate.executableByGame;
  if (
    !mappings ||
    typeof mappings !== "object" ||
    Array.isArray(mappings) ||
    Object.values(mappings).some((path) => typeof path !== "string") ||
    !Array.isArray(candidate.favorites) ||
    candidate.favorites.some((path) => typeof path !== "string") ||
    !Array.isArray(candidate.recent) ||
    candidate.recent.some((path) => typeof path !== "string") ||
    typeof candidate.soundEnabled !== "boolean" ||
    (candidate.libraryPaths !== undefined &&
      (!Array.isArray(candidate.libraryPaths) ||
        candidate.libraryPaths.some((path) => typeof path !== "string"))) ||
    (candidate.vibrationEnabled !== undefined &&
      typeof candidate.vibrationEnabled !== "boolean")
  ) {
    throw new Error(
      "Nyx settings are incomplete or damaged. The game library is still available; reset nyx-settings.json in Nyx's app data to restore defaults.",
    );
  }
  return {
    ...candidate,
    libraryPaths: candidate.libraryPaths ?? [...DEFAULT_PREFERENCES.libraryPaths],
    vibrationEnabled: candidate.vibrationEnabled ?? true,
  } as GamePreferences;
}

export function savePreferences(value: GamePreferences) {
  const saving = saveQueue.then(async () => {
    const store = await load(STORE_NAME, { autoSave: true });
    await store.set(STORE_KEY, value);
    await store.save();
  });
  saveQueue = saving.catch(() => {});
  return saving;
}
