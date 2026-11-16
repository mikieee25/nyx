"use client";

import { Button } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PREFERENCES, type GameFolder, type GamePreferences } from "./types";
import { isTauri, launchGame, scanGames } from "@/lib/tauri";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { playCue } from "@/lib/audio";
import { useStartupAnimation } from "@/lib/animations";
import { useGamepad, type PadAction } from "@/lib/gamepad";

type Filter = "all" | "installed" | "favorites" | "recent";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Games" }, { id: "installed", label: "Installed" },
  { id: "favorites", label: "Favorites" }, { id: "recent", label: "Recent" },
];

export default function LibraryScreen() {
  const [games, setGames] = useState<GameFolder[]>([]);
  const [preferences, setPreferences] = useState<GamePreferences>(DEFAULT_PREFERENCES);
  const preferencesRef = useRef(preferences);
  const [activePath, setActivePath] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [scanError, setScanError] = useState("");
  const [notice, setNotice] = useState("");
  const [intro, setIntro] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const updatePreferences = useCallback((change: (old: GamePreferences) => GamePreferences) => {
    const next = change(preferencesRef.current);
    preferencesRef.current = next;
    setPreferences(next);
    if (isTauri()) void savePreferences(next).catch((error) => setNotice(`Could not save Nyx settings: ${String(error)}`));
  }, []);

  const readLibrary = useCallback(async (includePreferences = false) => {
    if (!isTauri()) {
      setScanError("Open Nyx as the desktop app to scan D:\\Games. The browser preview cannot read local drives.");
      setPreferencesReady(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setScanError("");
    const [libraryResult, preferenceResult] = await Promise.all([
      scanGames().then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error })),
      includePreferences ? loadPreferences().then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error })) : Promise.resolve(null),
    ]);
    if (preferenceResult?.ok) {
      const restored = preferenceResult.value;
      preferencesRef.current = restored;
      setPreferences(restored);
    } else if (preferenceResult && !preferenceResult.ok) {
      setNotice(`Nyx could not load saved settings: ${String(preferenceResult.error)}`);
    }
    if (includePreferences) setPreferencesReady(true);
    if (libraryResult.ok) {
      setGames(libraryResult.value);
      setActivePath((current) => libraryResult.value.some((game) => game.path === current) ? current : libraryResult.value[0]?.path ?? "");
      setScanError("");
      if (includePreferences) {
        const stale = Object.entries(preferencesRef.current.executableByGame).some(([path, executable]) => {
          const game = libraryResult.value.find((item) => item.path === path);
          return game && !game.executables.some((item) => item.path === executable);
        });
        if (stale) setNotice("A saved launch file could not be found. Choose a current executable for that game.");
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
    if (preferencesReady && intro && preferences.soundEnabled && !startupCuePlayed.current && isTauri()) {
      startupCuePlayed.current = true;
      playCue("launch", true);
    }
  }, [intro, preferences.soundEnabled, preferencesReady]);

  const visibleGames = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    let result = games.filter((game) => game.name.toLocaleLowerCase().includes(needle));
    if (filter === "installed") result = result.filter((game) => game.executables.length > 0);
    if (filter === "favorites") result = result.filter((game) => preferences.favorites.includes(game.path));
    if (filter === "recent") result = preferences.recent.flatMap((path) => result.filter((game) => game.path === path));
    return result;
  }, [filter, games, preferences.favorites, preferences.recent, query]);
  const selected = visibleGames.find((game) => game.path === activePath) ?? visibleGames[0];
  const favorite = selected ? preferences.favorites.includes(selected.path) : false;
  const chosenPath = selected && selected.executables.some((exe) => exe.path === preferences.executableByGame[selected.path])
    ? preferences.executableByGame[selected.path]
    : selected?.executables.length === 1 ? selected.executables[0].path : "";
  const selectedExe = selected?.executables.find((exe) => exe.path === chosenPath);
  const moveSelection = useCallback((delta: number) => {
    if (!visibleGames.length) return;
    const current = visibleGames.findIndex((game) => game.path === (selected?.path ?? activePath));
    const next = (current + delta + visibleGames.length) % visibleGames.length;
    setActivePath(visibleGames[next].path);
    playCue("navigate", preferencesRef.current.soundEnabled);
  }, [activePath, selected?.path, visibleGames]);

  const startGame = useCallback(async () => {
    if (!selected) return;
    if (!chosenPath) {
      setNotice(selected.executables.length ? "Choose a game executable before launching." : "No .exe files were found in this game folder.");
      return;
    }
    try {
      playCue("launch", preferencesRef.current.soundEnabled);
      await launchGame(chosenPath);
      updatePreferences((old) => ({ ...old, recent: [selected.path, ...old.recent.filter((path) => path !== selected.path)].slice(0, 20) }));
      setNotice(`Launching ${selected.name}`);
    } catch (error) {
      setNotice(`Could not launch ${selectedExe?.name ?? selected.name}: ${String(error)}`);
    }
  }, [chosenPath, selected, selectedExe?.name, updatePreferences]);

  const focusStep = useCallback((direction: -1 | 1) => {
    const controls = Array.from(document.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)"))
      .filter((control) => control.getClientRects().length > 0 && !control.closest(".carousel-card.is-hidden"));
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement as HTMLElement);
    controls[(index + direction + controls.length) % controls.length]?.focus();
  }, []);

  const connected = useGamepad(useCallback((action: PadAction) => {
    if (intro) { if (action === "confirm" || action === "start") setIntro(false); return; }
    if (action === "left" || action === "right") moveSelection(action === "left" ? -1 : 1);
    if (action === "up" || action === "down") focusStep(action === "up" ? -1 : 1);
    if (action === "confirm") {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches(".carousel-card.is-active")) void startGame();
      else if (focused instanceof HTMLElement && focused !== document.body && focused.matches("button, input, select")) focused.click();
      else void startGame();
    }
    if (action === "start") void startGame();
    if (action === "back") { setFilter("all"); setQuery(""); }
  }, [focusStep, intro, moveSelection, startGame]));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (intro && ["Enter", " ", "Escape"].includes(event.key)) { event.preventDefault(); setIntro(false); return; }
      if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(1); }
      if (event.key === "ArrowUp") { event.preventDefault(); focusStep(-1); }
      if (event.key === "ArrowDown") { event.preventDefault(); focusStep(1); }
      if (event.key === "Escape") { setFilter("all"); setQuery(""); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const introRef = useStartupAnimation(() => setIntro(false), reducedMotion);
  const activeIndex = selected ? visibleGames.findIndex((game) => game.path === selected.path) : 0;
  const totalExecutables = games.reduce((count, game) => count + game.executables.length, 0);

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden="true" />
      <header className="topbar">
        <div className="brand" aria-label="Nyx game launcher">
          <img src="/nyx-icon.png" alt="" className="brand-icon" />
          <div><div className="brand-name">NYX</div><div className="brand-caption">Local game library</div></div>
        </div>
        <nav className="filters" aria-label="Library filters">
          {FILTERS.map(({ id, label }) => <button key={id} className="filter-button" aria-pressed={filter === id} onClick={() => { setFilter(id); playCue("navigate", preferences.soundEnabled); }}>{label}</button>)}
        </nav>
        <div className="top-actions">
          <label className="sr-only" htmlFor="library-search">Search games</label>
          <input id="library-search" className="search-field" placeholder="Search library…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="icon-button" title={preferences.soundEnabled ? "Mute interface sounds" : "Enable interface sounds"} aria-label={preferences.soundEnabled ? "Mute interface sounds" : "Enable interface sounds"} aria-pressed={preferences.soundEnabled} onClick={() => { const enabled = !preferencesRef.current.soundEnabled; updatePreferences((old) => ({ ...old, soundEnabled: enabled })); playCue("confirm", enabled); }}>
            {preferences.soundEnabled ? "♫" : "♪̸"}
          </button>
        </div>
      </header>

      <main className="library-stage">
        <div className="stage-heading">
          <div><div className="eyebrow">Your collection</div><h2 className="section-title">Game library</h2><div className="library-path">Library location&nbsp; <strong>D:\Games</strong></div></div>
          <button className="scan-button" disabled={loading} onClick={() => void readLibrary()}>{loading ? "Scanning…" : "↻  Rescan library"}</button>
        </div>

        <section className="carousel-wrap" aria-label="Game carousel">
          {visibleGames.length ? <>
            {visibleGames.map((game, index) => {
              const offset = index - activeIndex;
              const position = offset === 0 ? "is-active" : offset === -1 ? "is-before" : offset === 1 ? "is-after" : "is-hidden";
              return <button key={game.path} type="button" className={`carousel-card ${position}`} aria-label={`Select ${game.name}`} aria-current={offset === 0 ? "true" : undefined} onClick={() => setActivePath(game.path)}>
                {game.coverDataUrl ? <img className="card-cover" src={game.coverDataUrl} alt="" /> : <div className="card-fallback"><img src="/nyx-icon.png" alt="" /></div>}
                <span className="card-info"><strong className="card-name">{game.name}</strong><span className="card-meta">{game.executables.length ? `${game.executables.length} launch file${game.executables.length === 1 ? "" : "s"}` : "No executable found"}</span></span>
              </button>;
            })}
            <button className="carousel-arrow prev" aria-label="Previous game" onClick={() => moveSelection(-1)}>‹</button>
            <button className="carousel-arrow next" aria-label="Next game" onClick={() => moveSelection(1)}>›</button>
          </> : <div className="empty-carousel" role="status">
            <div className="empty-icon">{loading ? "◌" : scanError ? "!" : games.length ? "⌕" : "◇"}</div>
            <h3 className="empty-title">{loading ? "Checking your library" : scanError ? "Library unavailable" : games.length ? "No games match" : "Your library is waiting"}</h3>
            <p className="empty-copy">{loading ? "Nyx is scanning the game folders on D:\\Games." : scanError ? "Check that the D: drive is connected, then rescan. Nyx only reads game folders from this local library." : games.length ? "Try another search or library filter." : "Add each game in its own folder under D:\\Games. Nyx will find local .exe files and optional cover.png or folder.jpg artwork."}</p>
            {scanError && <div className="error-banner" role="alert">{scanError}</div>}
          </div>}
        </section>
        {scanError && games.length > 0 && <div className="error-banner" role="alert">Library rescan failed. Showing your last scanned games. {scanError}</div>}

        {selected ? <section className="hero-details" aria-live="polite">
          <div className="hero-copy">
            <div className="eyebrow">{selected.executables.length ? "Ready to play" : "Game folder detected"} <span aria-hidden="true">·</span> Local install</div>
            <h1 className="game-title">{selected.name}</h1>
            <div className="game-subtitle" title={selected.path}>{selected.path}</div>
            <div className="game-actions">
              <Button className="play-button" variant="primary" onPress={() => void startGame()} isDisabled={!selectedExe || loading}>▶&nbsp; Launch game</Button>
              <button className="favorite-button" aria-label={favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={favorite} onClick={() => updatePreferences((old) => ({ ...old, favorites: favorite ? old.favorites.filter((path) => path !== selected.path) : [...old.favorites, selected.path] }))}>{favorite ? "♥" : "♡"}</button>
              {selected.executables.length > 1 && <label className="sr-only" htmlFor="exe-select">Choose game executable</label>}
              {selected.executables.length > 1 && <select id="exe-select" className="select-executable" value={chosenPath} onChange={(event) => updatePreferences((old) => ({ ...old, executableByGame: { ...old.executableByGame, [selected.path]: event.target.value } }))}>
                <option value="">Choose launch file…</option>{selected.executables.map((exe) => <option key={exe.path} value={exe.path}>{exe.name}</option>)}
              </select>}
            </div>
          </div>
          <div className="stats-panel" aria-label="Local game information">
            <div className="stat-cell"><div className="stat-label">Library</div><div className="stat-value">{games.length} game{games.length === 1 ? "" : "s"}</div></div>
            <div className="stat-cell"><div className="stat-label">Launch files</div><div className="stat-value">{selected.executables.length ? `${selected.executables.length} found` : "Not found"}</div></div>
            <div className="stat-cell"><div className="stat-label">Last played</div><div className="stat-value">{preferences.recent.includes(selected.path) ? "Recently" : "Not yet"}</div></div>
          </div>
        </section> : !loading && <div className="hero-details"><div className="hero-copy"><div className="eyebrow">Local library</div><h1 className="game-title">{visibleGames.length ? "Choose a game" : ""}</h1></div></div>}
      </main>

      <footer className="bottom-bar">
        <div className="status-group"><span><i className={`status-dot ${!scanError && !loading ? "ready" : ""}`} />{loading ? "Scanning D:\\Games" : scanError ? "Drive unavailable" : `${games.length} game folders · ${totalExecutables} executables`}</span><span>Local library</span></div>
        <div className="controller-hints"><span className="controller-pill">{connected ? "Controller connected" : "Controller disconnected"}</span><span>↑ ↓ Focus</span><span>← → Browse</span><span>Confirm / Start</span><span>Back</span></div>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}
      {intro && <div className="intro" ref={introRef}><div className="intro-content"><img className="intro-icon" src="/nyx-icon.png" alt="" /><span className="intro-label">Wake the night</span></div><button className="intro-skip" onClick={() => setIntro(false)}>Skip&nbsp; ↵</button></div>}
    </div>
  );
}
