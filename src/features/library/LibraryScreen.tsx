"use client";

import { Button } from "@heroui/react";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  Minus,
  Play,
  RefreshCw,
  Search,
  Square,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import gsap from "gsap";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  DEFAULT_PREFERENCES,
  type GameFolder,
  type GamePreferences,
} from "./types";
import {
  clearSteamGridDBKey,
  downloadSteamGridDBArtwork,
  hasSteamGridDBKey,
  isTauri,
  launchGame,
  saveSteamGridDBKey,
  scanGames,
  searchSteamGridDBArtwork,
  searchSteamGridDBGames,
  type SteamGridDBArtwork,
  type SteamGridDBGame,
} from "@/lib/tauri";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { playCue } from "@/lib/audio";
import { useStartupAnimation } from "@/lib/animations";
import { useGamepad, type PadAction } from "@/lib/gamepad";
import NyxMark from "./NyxMark";

type Filter = "all" | "favorites" | "recent";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Games" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
];

async function createBackdropThumbnail(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();

  const width = Math.min(256, image.naturalWidth);
  const height = Math.max(
    1,
    Math.round((image.naturalHeight * width) / image.naturalWidth),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an artwork thumbnail canvas.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.78);
}

export default function LibraryScreen() {
  const [games, setGames] = useState<GameFolder[]>([]);
  const [preferences, setPreferences] =
    useState<GamePreferences>(DEFAULT_PREFERENCES);
  const preferencesRef = useRef(preferences);
  const filtersRef = useRef<HTMLElement>(null);
  const activeFilterPillRef = useRef<HTMLSpanElement>(null);
  const activeFilterPillReady = useRef(false);
  const [activePath, setActivePath] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const deferredFilter = useDeferredValue(filter);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [scanError, setScanError] = useState("");
  const [notice, setNotice] = useState("");
  const [intro, setIntro] = useState(true);
  const [backdropImages, setBackdropImages] = useState<{
    previous: string | null;
    current: string | null;
  }>({ previous: null, current: null });
  const [controllerMode, setControllerMode] = useState(false);
  const [backHoldProgress, setBackHoldProgress] = useState(0);
  const [gameOpen, setGameOpen] = useState(false);
  const [exePickerOpen, setExePickerOpen] = useState(false);
  const [exeOptionIndex, setExeOptionIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [artTint, setArtTint] = useState("rgba(42, 126, 150, .34)");
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [artworkQuery, setArtworkQuery] = useState("");
  const [gameMatches, setGameMatches] = useState<SteamGridDBGame[]>([]);
  const [sgdbGame, setSgdbGame] = useState<SteamGridDBGame | null>(null);
  const [artworkOptions, setArtworkOptions] = useState<SteamGridDBArtwork[]>(
    [],
  );
  const [artworkBusy, setArtworkBusy] = useState(false);
  const [artworkError, setArtworkError] = useState("");
  const artworkDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void)[] = [];
    let cancelled = false;
    void Promise.all([
      listen("game-started", () => setGameOpen(true)),
      listen("game-exited", () => setGameOpen(false)),
    ]).then((stopListening) => {
      if (cancelled) stopListening.forEach((stop) => stop());
      else unlisten = stopListening;
    }).catch((error: unknown) => {
      setGameOpen(false);
      setNotice(`Could not monitor game state: ${String(error)}`);
    });
    return () => {
      cancelled = true;
      unlisten.forEach((stop) => stop());
    };
  }, []);

  useEffect(() => {
    const showCursor = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen")
        setControllerMode(false);
    };
    window.addEventListener("pointermove", showCursor);
    window.addEventListener("pointerdown", showCursor);
    return () => {
      window.removeEventListener("pointermove", showCursor);
      window.removeEventListener("pointerdown", showCursor);
    };
  }, []);

  const placePill = useCallback((animate: boolean) => {
    const pill = activeFilterPillRef.current;
    const active = filtersRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (!pill || !active) return;
    const x = active.offsetLeft;
    const width = active.offsetWidth;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || !activeFilterPillReady.current || reduce) {
      gsap.killTweensOf(pill);
      gsap.set(pill, { x, width, opacity: 1 });
      activeFilterPillReady.current = true;
      return;
    }
    gsap.to(pill, {
      x, width, opacity: 1,
      duration: 0.3,
      ease: "power3.out",
      overwrite: "auto",
    });
  }, []);

  useEffect(() => {
    placePill(true);
  }, [filter, placePill]);

  useEffect(() => {
    const filters = filtersRef.current;
    const pill = activeFilterPillRef.current;
    if (!filters) return;
    const observer = new ResizeObserver(() => placePill(false));
    observer.observe(filters);
    return () => {
      observer.disconnect();
      if (pill) gsap.killTweensOf(pill);
    };
  }, [placePill]);

  const updatePreferences = useCallback(
    (change: (old: GamePreferences) => GamePreferences) => {
      const next = change(preferencesRef.current);
      preferencesRef.current = next;
      setPreferences(next);
      if (isTauri())
        void savePreferences(next).catch((error) =>
          setNotice(`Could not save Nyx settings: ${String(error)}`),
        );
    },
    [],
  );

  const readLibrary = useCallback(async (includePreferences = false) => {
    if (!isTauri()) {
      setScanError(
        "Open Nyx as the desktop app to scan D:\\Games. The browser preview cannot read local drives.",
      );
      setPreferencesReady(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setScanError("");
    if (includePreferences) {
      const preferenceResult = await loadPreferences().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      if (preferenceResult.ok) {
        const restored = preferenceResult.value;
        preferencesRef.current = restored;
        setPreferences(restored);
      } else {
        setNotice(
          `Nyx could not load saved settings: ${String(preferenceResult.error)}`,
        );
      }
      setPreferencesReady(true);
    }
    const libraryResult = await scanGames().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    if (libraryResult.ok) {
      setGames(libraryResult.value);
      setActivePath((current) =>
        libraryResult.value.some((game) => game.path === current)
          ? current
          : (libraryResult.value[0]?.path ?? ""),
      );
      setScanError("");
      if (includePreferences) {
        const stale = Object.entries(
          preferencesRef.current.executableByGame,
        ).some(([path, executable]) => {
          const game = libraryResult.value.find((item) => item.path === path);
          return (
            game && !game.executables.some((item) => item.path === executable)
          );
        });
        if (stale)
          setNotice(
            "A saved launch file could not be found. Choose a current executable for that game.",
          );
      }
    } else {
      setScanError(String(libraryResult.error));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(preference.matches);
    const updateMotion = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updateMotion);
    void readLibrary(true);
    return () => preference.removeEventListener("change", updateMotion);
  }, [readLibrary]);

  const startupCuePlayed = useRef(false);
  useEffect(() => {
    if (!preferencesReady || startupCuePlayed.current) return;
    startupCuePlayed.current = true;
    if (preferences.soundEnabled && isTauri()) playCue("launch", true);
  }, [preferences.soundEnabled, preferencesReady]);

  const visibleGames = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    let result = games.filter((game) =>
      game.name.toLocaleLowerCase().includes(needle),
    );
    if (deferredFilter === "favorites")
      result = result.filter((game) =>
        preferences.favorites.includes(game.path),
      );
    if (deferredFilter === "recent")
      result = preferences.recent.flatMap((path) =>
        result.filter((game) => game.path === path),
      );
    return result;
  }, [deferredFilter, games, preferences.favorites, preferences.recent, query]);
  const selected =
    visibleGames.find((game) => game.path === activePath) ?? visibleGames[0];
  const favorite = selected
    ? preferences.favorites.includes(selected.path)
    : false;
  const chosenPath =
    selected &&
    selected.executables.some(
      (exe) => exe.path === preferences.executableByGame[selected.path],
    )
      ? preferences.executableByGame[selected.path]
      : selected?.executables.length === 1
        ? selected.executables[0].path
        : "";
  const selectedExe = selected?.executables.find(
    (exe) => exe.path === chosenPath,
  );
  const openExePicker = useCallback(() => {
    if (!selected) return;
    const selectedIndex = selected.executables.findIndex(
      (exe) => exe.path === chosenPath,
    );
    setExeOptionIndex(Math.max(0, selectedIndex));
    setExePickerOpen(true);
  }, [chosenPath, selected]);
  const closeExePicker = useCallback(() => setExePickerOpen(false), []);
  const chooseExecutable = useCallback(
    (path: string) => {
      if (selected)
        updatePreferences((old) => ({
          ...old,
          executableByGame: {
            ...old.executableByGame,
            [selected.path]: path,
          },
        }));
      setExePickerOpen(false);
    },
    [selected, updatePreferences],
  );

  useEffect(() => {
    if (!selected?.coverDataUrl) {
      setArtTint("rgba(42, 126, 150, .34)");
      return;
    }
    let current = true;
    const image = new Image();
    image.onload = () => {
      if (!current) return;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, 1, 1);
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      setArtTint(`rgba(${red}, ${green}, ${blue}, .48)`);
    };
    image.src = selected.coverDataUrl;
    return () => {
      current = false;
      image.onload = null;
    };
  }, [selected?.coverDataUrl]);

  useEffect(() => {
    let cancelled = false;
    let fadeTimer: number | undefined;
    const setCurrent = (current: string | null) => {
      setBackdropImages((previous) => ({ previous: previous.current, current }));
      fadeTimer = window.setTimeout(() => {
        setBackdropImages((state) =>
          state.current === current ? { ...state, previous: null } : state,
        );
      }, 420);
    };

    if (!selected?.coverDataUrl) setCurrent(null);
    else
      void createBackdropThumbnail(selected.coverDataUrl)
        .then((thumbnail) => {
          if (!cancelled) setCurrent(thumbnail);
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setNotice(`Could not prepare backdrop artwork: ${String(error)}`);
        });

    return () => {
      cancelled = true;
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
    };
  }, [selected?.coverDataUrl]);

  useEffect(() => {
    const dialog = artworkDialog.current;
    if (artworkOpen) {
      if (dialog && !dialog.open) dialog.showModal();
      if (isTauri())
        void hasSteamGridDBKey()
          .then(setApiKeySaved)
          .catch((error) =>
            setArtworkError(
              `Could not check SteamGridDB key: ${String(error)}`,
            ),
          );
    } else if (dialog?.open) dialog.close();
  }, [artworkOpen]);

  const moveSelection = useCallback(
    (delta: number) => {
      if (visibleGames.length <= 1) return false;
      const current = visibleGames.findIndex(
        (game) => game.path === (selected?.path ?? activePath),
      );
      const next =
        (current + delta + visibleGames.length) % visibleGames.length;
      if (visibleGames[next].path === selected?.path) return false;
      setActivePath(visibleGames[next].path);
      playCue("navigate", preferencesRef.current.soundEnabled);
      return true;
    },
    [activePath, selected?.path, visibleGames],
  );

  const startGame = useCallback(() => {
    if (!selected) return false;
    if (!chosenPath) {
      setNotice(
        selected.executables.length
          ? "Choose a game executable before launching."
          : "No .exe files were found in this game folder.",
      );
      return false;
    }
    setNotice("");
    if (isTauri()) setGameOpen(true);
    playCue("launch", preferencesRef.current.soundEnabled);
    void launchGame(chosenPath)
      .then(() =>
        updatePreferences((old) => ({
          ...old,
          recent: [
            selected.path,
            ...old.recent.filter((path) => path !== selected.path),
          ].slice(0, 20),
        })),
      )
      .catch((error) => {
        setGameOpen(false);
        setNotice(
          `Could not launch ${selectedExe?.name ?? selected.name}: ${String(error)}`,
        );
      });
    return true;
  }, [chosenPath, selected, selectedExe?.name, updatePreferences]);

  const focusStep = useCallback(
    (direction: -1 | 1) => {
      const root: ParentNode =
        artworkOpen && artworkDialog.current?.open
          ? artworkDialog.current
          : document;
      const controls = Array.from(
        root.querySelectorAll<HTMLElement>(
          "button:not(:disabled):not(.window-control), input:not(:disabled), select:not(:disabled)",
        ),
      ).filter(
        (control) =>
          control.getClientRects().length > 0 &&
          !control.closest(
            ".carousel-card.is-far-before, .carousel-card.is-far-after",
          ),
      );
      if (!controls.length) return false;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const target = controls[
        (index + direction + controls.length) % controls.length
      ];
      if (!target) return false;
      target.focus();
      return true;
    },
    [artworkOpen],
  );

  const controlWindow = useCallback(
    async (action: "minimize" | "toggleMaximize" | "close") => {
      if (!isTauri()) return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow[action]();
      } catch (error) {
        setNotice(
          `Could not ${action === "toggleMaximize" ? "resize" : action} the Nyx window: ${String(error)}`,
        );
      }
    },
    [],
  );
  const handleBackHoldProgress = useCallback(
    (progress: number) => {
      setBackHoldProgress(progress);
      if (progress >= 1) void controlWindow("close");
    },
    [controlWindow],
  );

  const handleGamepadAction = useCallback(
    (action: PadAction) => {
      setControllerMode(true);
      if (intro) {
        if (action === "confirm" || action === "start") {
          setIntro(false);
          return true;
        }
        return false;
      }
      if (action === "rescan") {
        if (loading) return false;
        void readLibrary();
        return true;
      }
      if (artworkOpen) {
        if (action === "back") {
          setArtworkOpen(false);
          return true;
        }
        if (action === "left" || action === "up") return focusStep(-1);
        if (action === "right" || action === "down") return focusStep(1);
        if (action === "confirm") {
          const focused = document.activeElement;
          if (
            focused instanceof HTMLElement &&
            focused.matches("button, input, select")
          ) {
            focused.click();
            return true;
          }
        }
        return false;
      }
      if (action === "options") {
        const executableSelect =
          document.querySelector<HTMLButtonElement>("#exe-select");
        if (executableSelect) {
          executableSelect.focus();
          return true;
        }
        setNotice("This game has no alternate executable to select.");
        return false;
      }
      if (exePickerOpen) {
        if (action === "back") {
          closeExePicker();
          return true;
        }
        if (action === "up" || action === "down") {
          if (!selected?.executables.length) return false;
          const direction = action === "up" ? -1 : 1;
          setExeOptionIndex(
            (index) =>
              (index + direction + selected.executables.length) %
              selected.executables.length,
          );
          return true;
        }
        if (action === "confirm") {
          const executable = selected?.executables[exeOptionIndex];
          if (!executable) return false;
          chooseExecutable(executable.path);
          return true;
        }
        return false;
      }
      if (action === "previous-tab" || action === "next-tab") {
        setFilter((current) => {
          const index = FILTERS.findIndex(({ id }) => id === current);
          const direction = action === "previous-tab" ? -1 : 1;
          return FILTERS[
            (index + direction + FILTERS.length) % FILTERS.length
          ].id;
        });
        playCue("navigate", preferencesRef.current.soundEnabled);
        return true;
      }
      if (action === "left" || action === "right")
        return moveSelection(action === "left" ? -1 : 1);
      if (action === "up" || action === "down")
        return focusStep(action === "up" ? -1 : 1);
      if (action === "confirm") {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused.id === "exe-select") {
          openExePicker();
          return true;
        }
        if (
          focused instanceof HTMLElement &&
          focused.matches(".carousel-card.is-active")
        )
          return startGame();
        if (
          focused instanceof HTMLElement &&
          focused !== document.body &&
          focused.matches("button, input, select")
        ) {
          focused.click();
          return true;
        }
        return startGame();
      }
      if (action === "start") return startGame();
      if (action === "back") {
        if (filter === "all" && !query) return false;
        setFilter("all");
        setQuery("");
        return true;
      }
      return false;
    },
    [
      artworkOpen,
      chooseExecutable,
      closeExePicker,
      exeOptionIndex,
      exePickerOpen,
      filter,
      focusStep,
      intro,
      loading,
      moveSelection,
      query,
      readLibrary,
      openExePicker,
      selected,
      startGame,
    ],
  );
  const connected = useGamepad(
    handleGamepadAction,
    preferences.vibrationEnabled,
    setNotice,
    !gameOpen,
    handleBackHoldProgress,
  );

  useEffect(() => {
    if (!connected) setControllerMode(false);
  }, [connected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (intro && ["Enter", " ", "Escape"].includes(event.key)) {
        event.preventDefault();
        setIntro(false);
        return;
      }
      if (artworkOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setArtworkOpen(false);
          return;
        }
        if (
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          focusStep(-1);
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          focusStep(1);
        }
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusStep(-1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusStep(1);
      }
      if (event.key === "Escape") {
        setFilter("all");
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [artworkOpen, focusStep, intro, moveSelection]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const introRef = useStartupAnimation(
    () => setIntro(false),
    reducedMotion,
    intro && preferencesReady,
    !loading && preferencesReady,
  );
  const activeIndex = selected
    ? visibleGames.findIndex((game) => game.path === selected.path)
    : 0;
  const beginWindowDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      (event.target instanceof HTMLElement &&
        event.target.closest(".window-controls")) ||
      !isTauri()
    )
      return;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch((error) =>
        setNotice(`Could not move the Nyx window: ${String(error)}`),
      );
  }, []);
  const openArtworkPicker = () => {
    if (!selected) return;
    setArtworkQuery(
      selected.name.replaceAll("-", " ").replace(/\s+/g, " ").trim(),
    );
    setGameMatches([]);
    setSgdbGame(null);
    setArtworkOptions([]);
    setArtworkError("");
    setArtworkOpen(true);
  };
  const searchArtworkGames = async () => {
    setArtworkBusy(true);
    setArtworkError("");
    try {
      const matches = await searchSteamGridDBGames(artworkQuery);
      setGameMatches(matches);
      setSgdbGame(null);
      setArtworkOptions([]);
      if (!matches.length)
        setNotice("SteamGridDB did not find a matching game.");
    } catch (error) {
      setArtworkError(String(error));
    } finally {
      setArtworkBusy(false);
    }
  };
  const chooseArtworkGame = async (game: SteamGridDBGame) => {
    setSgdbGame(game);
    setArtworkBusy(true);
    setArtworkError("");
    try {
      const options = await searchSteamGridDBArtwork(game.id);
      setArtworkOptions(options);
      if (!options.length)
        setNotice(`SteamGridDB has no portrait artwork for ${game.name}.`);
    } catch (error) {
      setArtworkError(String(error));
    } finally {
      setArtworkBusy(false);
    }
  };
  const saveApiKey = async () => {
    setArtworkBusy(true);
    setArtworkError("");
    try {
      await saveSteamGridDBKey(apiKeyDraft);
      setApiKeyDraft("");
      setApiKeySaved(true);
      setNotice("SteamGridDB API key saved in Windows Credential Manager.");
    } catch (error) {
      setArtworkError(String(error));
    } finally {
      setArtworkBusy(false);
    }
  };
  const removeApiKey = async () => {
    setArtworkBusy(true);
    setArtworkError("");
    try {
      await clearSteamGridDBKey();
      setApiKeySaved(false);
      setGameMatches([]);
      setSgdbGame(null);
      setArtworkOptions([]);
      setNotice("SteamGridDB API key removed.");
    } catch (error) {
      setArtworkError(String(error));
    } finally {
      setArtworkBusy(false);
    }
  };
  const saveArtwork = async (artwork: SteamGridDBArtwork) => {
    if (!selected || !sgdbGame) return;
    setArtworkBusy(true);
    setArtworkError("");
    try {
      await downloadSteamGridDBArtwork(selected.path, sgdbGame.id, artwork.id);
      setArtworkOpen(false);
      await readLibrary();
      setNotice(`Artwork saved for ${selected.name}.`);
    } catch (error) {
      setArtworkError(String(error));
    } finally {
      setArtworkBusy(false);
    }
  };

  return (
    <div
      className={`app-shell${intro ? "" : " is-ready"}${controllerMode ? " controller-mode" : ""}`}
    >
      {backHoldProgress > 0 && (
        <div className="gamepad-close-progress" role="status" aria-live="polite">
          <span>Hold B / Circle to close Nyx</span>
          <div
            className="gamepad-close-progress-track"
            role="progressbar"
            aria-label="Close Nyx"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(backHoldProgress * 100)}
          >
            <i style={{ transform: `scaleX(${backHoldProgress})` }} />
          </div>
        </div>
      )}
      <div className="ambient" aria-hidden="true" />
      <div className="game-backdrop" aria-hidden="true">
        {backdropImages.previous && (
          <div
            key={backdropImages.previous}
            className="backdrop-layer is-previous"
            style={{
              backgroundImage: `radial-gradient(ellipse at 50% 16%, ${artTint}, transparent 63%), url("${backdropImages.previous}")`,
            }}
          />
        )}
        {backdropImages.current && (
          <div
            key={backdropImages.current}
            className="backdrop-layer is-current"
            style={{
              backgroundImage: `radial-gradient(ellipse at 50% 16%, ${artTint}, transparent 63%), url("${backdropImages.current}")`,
            }}
          />
        )}
      </div>
      <header
        className="windowbar"
        onMouseDown={beginWindowDrag}
        onDoubleClick={(event) => {
          if (!(
            event.target instanceof HTMLElement &&
            event.target.closest(".window-controls")
          ))
            void controlWindow("toggleMaximize");
        }}
      >
        <div className="window-brand" data-tauri-drag-region>
          <img src="/nyx-icon.png" alt="" />
          <span data-tauri-drag-region>Nyx</span>
        </div>
        <div className="window-controls" aria-label="Window controls">
          <button
            className="window-control"
            aria-label="Minimize window"
            title="Minimize"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void controlWindow("minimize")}
          >
            <Minus className="ui-icon" aria-hidden="true" />
          </button>
          <button
            className="window-control"
            aria-label="Maximize or restore window"
            title="Maximize or restore"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void controlWindow("toggleMaximize")}
          >
            <Square className="ui-icon" aria-hidden="true" />
          </button>
          <button
            className="window-control close"
            aria-label="Close window"
            title="Close"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void controlWindow("close")}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </header>
      <header className="topbar">
        <div className="topbar-heading">
          <div className="eyebrow">Your collection</div>
          <h2 className="section-title">Game library</h2>
          <div className="library-path">
            Library location&nbsp; <strong>D:\Games</strong>
          </div>
        </div>
        <nav className="filters" ref={filtersRef} aria-label="Library filters">
          <span
            className="filter-indicator"
            ref={activeFilterPillRef}
            aria-hidden="true"
          />
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              className="filter-button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                playCue("navigate", preferences.soundEnabled);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <label className="sr-only" htmlFor="library-search">
            Search games
          </label>
          <input
            id="library-search"
            className="search-field"
            placeholder="Search library…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="icon-button sound-button"
            title={
              preferences.soundEnabled
                ? "Mute interface sounds"
                : "Enable interface sounds"
            }
            aria-label={
              preferences.soundEnabled
                ? "Mute interface sounds"
                : "Enable interface sounds"
            }
            aria-pressed={preferences.soundEnabled}
            onClick={() => {
              const enabled = !preferencesRef.current.soundEnabled;
              updatePreferences((old) => ({ ...old, soundEnabled: enabled }));
              playCue("confirm", enabled);
            }}
          >
            {preferences.soundEnabled ? (
              <Volume2 className="ui-icon sound-icon" aria-hidden="true" />
            ) : (
              <VolumeX className="ui-icon sound-icon" aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button vibration-button"
            title={
              preferences.vibrationEnabled
                ? "Turn controller vibration off"
                : "Turn controller vibration on"
            }
            aria-label={
              preferences.vibrationEnabled
                ? "Turn controller vibration off"
                : "Turn controller vibration on"
            }
            aria-pressed={preferences.vibrationEnabled}
            onClick={() => {
              const enabled = !preferencesRef.current.vibrationEnabled;
              updatePreferences((old) => ({
                ...old,
                vibrationEnabled: enabled,
              }));
            }}
          >
            {preferences.vibrationEnabled ? (
              <Vibrate className="ui-icon" aria-hidden="true" />
            ) : (
              <VibrateOff className="ui-icon" aria-hidden="true" />
            )}
          </button>
          <button
            className={`scan-button${loading ? " is-scanning" : ""}`}
            aria-label={loading ? "Scanning library" : "Rescan library"}
            title={loading ? "Scanning library" : "Rescan library"}
            disabled={loading}
            onClick={() => void readLibrary()}
          >
            {loading ? (
              <LoaderCircle
                className="ui-icon is-spinning"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw className="ui-icon" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <main className="library-stage">
        <section className="carousel-wrap" aria-label="Game carousel">
          {visibleGames.length ? (
            <>
              {visibleGames.map((game, index) => {
                const offset = index - activeIndex;
                const position =
                  offset === 0
                    ? "is-active"
                    : offset === -1
                      ? "is-before"
                      : offset === 1
                        ? "is-after"
                        : offset < 0
                          ? "is-far-before"
                          : "is-far-after";
                return (
                  <button
                    key={game.path}
                    type="button"
                    className={`carousel-card ${position}`}
                    aria-label={`Select ${game.name}`}
                    aria-current={offset === 0 ? "true" : undefined}
                    onClick={() => setActivePath(game.path)}
                  >
                    {game.coverDataUrl ? (
                      <img
                        className="card-cover"
                        src={game.coverDataUrl}
                        alt=""
                      />
                    ) : (
                      <div className="card-fallback">
                        {game.iconDataUrl ? (
                          <img
                            className="card-game-icon"
                            src={game.iconDataUrl}
                            alt=""
                          />
                        ) : (
                          <img src="/nyx-icon.png" alt="" />
                        )}
                      </div>
                    )}
                    <span className="card-shade" aria-hidden="true" />
                    {!game.executables.length && (
                      <span className="card-info card-meta">
                        No executable found
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                className="carousel-arrow prev"
                aria-label="Previous game"
                onClick={() => moveSelection(-1)}
              >
                <ChevronLeft className="ui-icon" aria-hidden="true" />
              </button>
              <button
                className="carousel-arrow next"
                aria-label="Next game"
                onClick={() => moveSelection(1)}
              >
                <ChevronRight className="ui-icon" aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="empty-carousel" role="status">
              <div className="empty-icon">
                {loading ? (
                  <LoaderCircle
                    className="ui-icon is-spinning"
                    aria-hidden="true"
                  />
                ) : scanError ? (
                  <AlertCircle className="ui-icon" aria-hidden="true" />
                ) : games.length ? (
                  <Search className="ui-icon" aria-hidden="true" />
                ) : (
                  <Gamepad2 className="ui-icon" aria-hidden="true" />
                )}
              </div>
              <h3 className="empty-title">
                {loading
                  ? "Checking your library"
                  : scanError
                    ? "Library unavailable"
                    : games.length
                      ? "No games match"
                      : "Your library is waiting"}
              </h3>
              <p className="empty-copy">
                {loading
                  ? "Nyx is scanning the game folders on D:\\Games."
                  : scanError
                    ? "Check that the D: drive is connected, then rescan. Nyx only reads game folders from this local library."
                    : games.length
                      ? "Try another search or library filter."
                      : "Add each game in its own folder under D:\\Games. Nyx finds local .exe files and artwork named cover, poster, banner, artwork, or folder."}
              </p>
              {scanError && (
                <div className="error-banner" role="alert">
                  {scanError}
                </div>
              )}
            </div>
          )}
        </section>
        {scanError && games.length > 0 && (
          <div className="error-banner" role="alert">
            Library rescan failed. Showing your last scanned games. {scanError}
          </div>
        )}

        {selected ? (
          <section className="hero-details" aria-live="polite">
            <div className="hero-copy">
              <div className="eyebrow">
                {selected.executables.length
                  ? "Ready to play"
                  : "Game folder detected"}
              </div>
              <h1 key={selected.path} className="game-title">
                {selected.name}
              </h1>
              <div className="game-subtitle" title={selected.path}>
                {selected.path}
              </div>
              <div className="game-actions">
                <Button
                  className="play-button"
                  variant="primary"
                  onPress={() => void startGame()}
                  isDisabled={!selectedExe || loading}
                >
                  <Play className="ui-icon" aria-hidden="true" />
                  Launch game
                </Button>
                <button
                  className="favorite-button"
                  aria-label={
                    favorite ? "Remove from favorites" : "Add to favorites"
                  }
                  aria-pressed={favorite}
                  onClick={() =>
                    updatePreferences((old) => ({
                      ...old,
                      favorites: favorite
                        ? old.favorites.filter((path) => path !== selected.path)
                        : [...old.favorites, selected.path],
                    }))
                  }
                >
                  <Heart
                    className="ui-icon"
                    aria-hidden="true"
                    fill={favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className="secondary-button artwork-button"
                  onClick={openArtworkPicker}
                >
                  <ImageIcon className="ui-icon" aria-hidden="true" />
                  Find artwork
                </button>
                {selected.executables.length > 1 && (
                  <div className="select-executable-wrap">
                    <button
                      id="exe-select"
                      className="select-executable"
                      type="button"
                      aria-label="Choose game executable"
                      aria-haspopup="listbox"
                      aria-expanded={exePickerOpen}
                      aria-controls="exe-options"
                      aria-activedescendant={
                        exePickerOpen ? `exe-option-${exeOptionIndex}` : undefined
                      }
                      onClick={() =>
                        exePickerOpen ? closeExePicker() : openExePicker()
                      }
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          if (!exePickerOpen) openExePicker();
                          else {
                            const direction = event.key === "ArrowUp" ? -1 : 1;
                            setExeOptionIndex(
                              (index) =>
                                (index + direction + selected.executables.length) %
                                selected.executables.length,
                            );
                          }
                        } else if (event.key === "Escape" && exePickerOpen) {
                          event.preventDefault();
                          closeExePicker();
                        } else if (
                          (event.key === "Enter" || event.key === " ") &&
                          exePickerOpen
                        ) {
                          event.preventDefault();
                          const executable = selected.executables[exeOptionIndex];
                          if (executable) chooseExecutable(executable.path);
                        }
                      }}
                    >
                      {selectedExe?.name ?? "Choose launch file…"}
                    </button>
                    <ChevronDown
                      className="select-executable-chevron ui-icon"
                      aria-hidden="true"
                    />
                    {exePickerOpen && (
                      <div
                        id="exe-options"
                        className="select-executable-options"
                        role="listbox"
                        aria-label="Available game executables"
                      >
                        {selected.executables.map((exe, index) => (
                          <button
                            key={exe.path}
                            type="button"
                            className="select-executable-option"
                            id={`exe-option-${index}`}
                            role="option"
                            aria-selected={index === exeOptionIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setExeOptionIndex(index)}
                            onClick={() => chooseExecutable(exe.path)}
                          >
                            {exe.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="stats-panel" aria-label="Local game information">
              <div className="stat-cell">
                <div className="stat-label">Library</div>
                <div className="stat-value">
                  {games.length} game{games.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Last played</div>
                <div className="stat-value">
                  {preferences.recent.includes(selected.path)
                    ? "Recently"
                    : "Not yet"}
                </div>
              </div>
            </div>
          </section>
        ) : (
          !loading && (
            <div className="hero-details">
              <div className="hero-copy">
                <div className="eyebrow">Local library</div>
                <h1 className="game-title">
                  {visibleGames.length ? "Choose a game" : ""}
                </h1>
              </div>
            </div>
          )
        )}
      </main>

      <footer className="bottom-bar">
        <div className="status-group">
          <span>
            <i
              className={`status-dot ${!scanError && !loading ? "ready" : ""}`}
            />
            {loading
              ? "Scanning D:\\Games"
              : scanError
                ? "Drive unavailable"
                : `${games.length} game folders`}
          </span>
          <span>Local library</span>
        </div>
        <div className="controller-hints">
          <span className="controller-pill">
            <Gamepad2 className="ui-icon" aria-hidden="true" />
            {connected ? "Controller connected" : "Controller disconnected"}
          </span>
        </div>
      </footer>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <dialog
        ref={artworkDialog}
        className="artwork-dialog"
        aria-labelledby="artwork-title"
        onCancel={(event) => {
          event.preventDefault();
          setArtworkOpen(false);
        }}
        onClose={() => setArtworkOpen(false)}
      >
        <div className="artwork-panel">
          <header className="artwork-heading">
            <div>
              <div className="eyebrow">Artwork lookup</div>
              <h2 id="artwork-title">Find cover art</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close artwork search"
              onClick={() => setArtworkOpen(false)}
            >
              <X className="ui-icon" aria-hidden="true" />
            </button>
          </header>
          <section className="api-key-box" aria-label="SteamGridDB API key">
            <div className="api-key-copy">
              <strong>
                {apiKeySaved ? "SteamGridDB connected" : "Connect SteamGridDB"}
              </strong>
              <span>
                Get your personal key at
                https://www.steamgriddb.com/profile/preferences/api. Nyx stores
                it in Windows Credential Manager.
              </span>
            </div>
            {apiKeySaved ? (
              <button
                className="secondary-button"
                disabled={artworkBusy}
                onClick={() => void removeApiKey()}
              >
                Remove key
              </button>
            ) : (
              <div className="api-key-entry">
                <label className="sr-only" htmlFor="sgdb-api-key">
                  SteamGridDB API key
                </label>
                <input
                  id="sgdb-api-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Paste API key"
                  value={apiKeyDraft}
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                />
                <button
                  className="secondary-button"
                  disabled={!apiKeyDraft.trim() || artworkBusy}
                  onClick={() => void saveApiKey()}
                >
                  Save key
                </button>
              </div>
            )}
          </section>
          <form
            className="artwork-search"
            onSubmit={(event) => {
              event.preventDefault();
              void searchArtworkGames();
            }}
          >
            <label className="sr-only" htmlFor="artwork-query">
              Game title
            </label>
            <input
              id="artwork-query"
              value={artworkQuery}
              onChange={(event) => setArtworkQuery(event.target.value)}
              placeholder="Search game title"
            />
            <button
              className="secondary-button"
              disabled={!apiKeySaved || !artworkQuery.trim() || artworkBusy}
            >
              <Search className="ui-icon" aria-hidden="true" />
              {artworkBusy ? "Searching…" : "Search"}
            </button>
          </form>
          {artworkError && (
            <div className="error-banner artwork-error" role="alert">
              {artworkError}
            </div>
          )}
          {!!gameMatches.length && (
            <section className="artwork-results" aria-label="Matching games">
              <h3>Choose the matching game</h3>
              <div className="artwork-game-list">
                {gameMatches.map((game) => (
                  <button
                    key={game.id}
                    className="secondary-button"
                    aria-pressed={sgdbGame?.id === game.id}
                    disabled={artworkBusy}
                    onClick={() => void chooseArtworkGame(game)}
                  >
                    {game.name}
                    {game.verified ? " · Verified" : ""}
                  </button>
                ))}
              </div>
            </section>
          )}
          {!!artworkOptions.length && (
            <section className="artwork-results" aria-label="Available covers">
              <h3>Choose a cover for {sgdbGame?.name}</h3>
              <div className="artwork-grid">
                {artworkOptions.map((artwork) => (
                  <button
                    key={artwork.id}
                    className="artwork-choice"
                    disabled={artworkBusy}
                    onClick={() => void saveArtwork(artwork)}
                  >
                    <img src={artwork.thumb} alt="" />
                    <span>{artwork.name}</span>
                    <small>{artwork.dimensions}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          {artworkBusy && (
            <div className="artwork-loading" role="status">
              <LoaderCircle
                className="ui-icon is-spinning"
                aria-hidden="true"
              />
              Contacting SteamGridDB…
            </div>
          )}
          {!apiKeySaved && (
            <p className="artwork-offline-note">
              The existing local artwork remains available. Internet is used
              only when you search or download a cover.
            </p>
          )}
        </div>
      </dialog>
      {intro && (
        <div className="intro" ref={introRef} aria-label="Nyx is starting">
          <div className="intro-ambient" aria-hidden="true" />
          <div className="intro-content">
            <NyxMark className="intro-mark" />
            <h1 className="intro-word" aria-label="Nyx">
              <span className="intro-letter">N</span>
              <span className="intro-letter">Y</span>
              <span className="intro-letter">X</span>
            </h1>
            <p className="intro-tag">Game launcher</p>
            <div className="intro-progress" aria-hidden="true">
              <i />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
