export type Cue = "navigate" | "confirm" | "back" | "launch";

const notes: Record<Cue, [number, number]> = {
  navigate: [440, 660],
  confirm: [523, 784],
  back: [392, 294],
  launch: [392, 587],
};

export function playCue(cue: Cue, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const context = new AudioContext();
    if (context.state !== "running") {
      void context.close();
      return;
    }
    const now = context.currentTime;
    notes[cue].forEach((frequency, index) => {
      const start = now + index * (cue === "launch" ? 0.11 : 0.055);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(cue === "launch" ? 0.045 : 0.025, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });
    window.setTimeout(() => void context.close(), 350);
  } catch {
    // Audio is an optional enhancement and must never block a launcher action.
  }
}
