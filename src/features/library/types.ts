export type ExecutableCandidate = { path: string; name: string };
export type GameFolder = {
  path: string;
  name: string;
  coverDataUrl: string | null;
  executables: ExecutableCandidate[];
};
export type GamePreferences = {
  executableByGame: Record<string, string>;
  favorites: string[];
  recent: string[];
  soundEnabled: boolean;
};

export const DEFAULT_PREFERENCES: GamePreferences = {
  executableByGame: {},
  favorites: [],
  recent: [],
  soundEnabled: true,
};
