export type ExecutableCandidate = { path: string; name: string };
export type GameFolder = {
  path: string;
  name: string;
  coverDataUrl: string | null;
  iconDataUrl: string | null;
  executables: ExecutableCandidate[];
};
export type GamePreferences = {
  libraryPaths: string[];
  executableByGame: Record<string, string>;
  favorites: string[];
  recent: string[];
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

export const DEFAULT_PREFERENCES: GamePreferences = {
  libraryPaths: ["D:\\Games"],
  executableByGame: {},
  favorites: [],
  recent: [],
  soundEnabled: true,
  vibrationEnabled: true,
};
