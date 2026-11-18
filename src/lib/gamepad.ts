"use client";

import { useEffect, useRef, useState } from "react";

export type PadAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "confirm"
  | "back"
  | "options"
  | "rescan"
  | "previous-tab"
  | "next-tab"
  | "start";

type Direction = "left" | "right" | "up" | "down";
type Pulse = { duration: number; weakMagnitude: number; strongMagnitude: number };
type RepeatState = { active: boolean; nextAt: number };
type PadState = {
  buttons: Set<number>;
  axisX: -1 | 0 | 1;
  axisY: -1 | 0 | 1;
  repeat: Record<Direction, RepeatState>;
  previousValues: number[];
  backPressedAt: number | null;
  backCloseFired: boolean;
  lastBackProgress: number;
};
type ActionRef = { current: (action: PadAction) => boolean | void };
type BooleanRef = { current: boolean };
type NoticeRef = { current: ((message: string) => void) | undefined };
type BackHoldRef = { current: ((progress: number) => void) | undefined };
const BACK_CLOSE_HOLD_MS = 2500;
const BACK_CLOSE_INDICATOR_DELAY_MS = 600;

const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];
const BUTTON_ACTIONS: Partial<Record<number, PadAction>> = {
  0: "confirm",
  1: "back",
  2: "options",
  3: "rescan",
  4: "previous-tab",
  5: "next-tab",
  9: "start",
};
const PULSES: Partial<Record<PadAction, Pulse>> = {
  left: { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  right: { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  up: { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  down: { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  "previous-tab": { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  "next-tab": { duration: 26, weakMagnitude: 0.12, strongMagnitude: 0.08 },
  confirm: { duration: 65, weakMagnitude: 0.3, strongMagnitude: 0.2 },
  rescan: { duration: 65, weakMagnitude: 0.3, strongMagnitude: 0.2 },
  start: { duration: 65, weakMagnitude: 0.3, strongMagnitude: 0.2 },
};

function createPadState(): PadState {
  const repeat = {} as Record<Direction, RepeatState>;
  for (const direction of DIRECTIONS)
    repeat[direction] = { active: false, nextAt: 0 };
  return {
    buttons: new Set(),
    axisX: 0,
    axisY: 0,
    repeat,
    previousValues: [],
    backPressedAt: null,
    backCloseFired: false,
    lastBackProgress: -1,
  };
}

function readAxis(value: number): -1 | 0 | 1 {
  return value > 0.65 ? 1 : value < -0.65 ? -1 : 0;
}

function updateAxis(previous: -1 | 0 | 1, value: number): -1 | 0 | 1 {
  if (previous < 0) {
    if (value > 0.65) return 1;
    return value > -0.35 ? 0 : -1;
  }
  if (previous > 0) {
    if (value < -0.65) return -1;
    return value < 0.35 ? 0 : 1;
  }
  return readAxis(value);
}

function dispatchAction(
  pad: Gamepad,
  action: PadAction,
  actionRef: ActionRef,
  vibrationRef: BooleanRef,
  warnedVibration: Set<number>,
) {
  if (actionRef.current(action) === false || !vibrationRef.current) return;
  const pulse = PULSES[action];
  if (!pulse) return;
  const actuator = pad.vibrationActuator;
  if (!actuator) {
    if (!warnedVibration.has(pad.index)) {
      warnedVibration.add(pad.index);
      console.warn(`[Nyx gamepad] ${pad.id} does not expose vibration support.`);
    }
    return;
  }
  void actuator.playEffect("dual-rumble", pulse).catch((error: unknown) => {
    if (warnedVibration.has(pad.index)) return;
    warnedVibration.add(pad.index);
    console.warn(`[Nyx gamepad] Vibration failed for ${pad.id}.`, error);
  });
}

function updateRepeat(
  pad: Gamepad,
  state: PadState,
  direction: Direction,
  pressed: boolean,
  now: number,
  actionRef: ActionRef,
  vibrationRef: BooleanRef,
  warnedVibration: Set<number>,
) {
  const repeat = state.repeat[direction];
  if (!pressed) {
    repeat.active = false;
    return;
  }
  if (!repeat.active) {
    repeat.active = true;
    repeat.nextAt = now + 400;
    dispatchAction(pad, direction, actionRef, vibrationRef, warnedVibration);
  } else if (now >= repeat.nextAt) {
    repeat.nextAt = now + 120;
    dispatchAction(pad, direction, actionRef, vibrationRef, warnedVibration);
  }
}

function seedBaseline(pad: Gamepad, state: PadState, now: number) {
  state.buttons.clear();
  for (let index = 0; index < pad.buttons.length; index++) {
    const button = pad.buttons[index];
    if (button?.pressed) state.buttons.add(index);
    state.previousValues[index] = button?.value ?? 0;
  }
  state.previousValues.length = pad.buttons.length;
  state.axisX = readAxis(pad.axes[0] ?? 0);
  state.axisY = readAxis(pad.axes[1] ?? 0);
  state.backPressedAt = null;
  state.backCloseFired = false;
  state.lastBackProgress = -1;
  const directions: Record<Direction, boolean> = {
    left: state.buttons.has(14) || state.axisX < 0,
    right: state.buttons.has(15) || state.axisX > 0,
    up: state.buttons.has(12) || state.axisY < 0,
    down: state.buttons.has(13) || state.axisY > 0,
  };
  for (const direction of DIRECTIONS) {
    state.repeat[direction].active = directions[direction];
    state.repeat[direction].nextAt = now + 400;
  }
}

export function useGamepad(
  onAction: (action: PadAction) => boolean | void,
  vibrationEnabled = true,
  onNotice?: (message: string) => void,
  enabled = true,
  onBackHoldProgress?: (progress: number) => void,
) {
  const actionRef = useRef(onAction);
  const vibrationRef = useRef(vibrationEnabled);
  const noticeRef = useRef(onNotice);
  const enabledRef = useRef(enabled);
  const backHoldRef = useRef(onBackHoldProgress);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    actionRef.current = onAction;
    vibrationRef.current = vibrationEnabled;
    noticeRef.current = onNotice;
    enabledRef.current = enabled;
    backHoldRef.current = onBackHoldProgress;
  }, [enabled, onAction, onBackHoldProgress, onNotice, vibrationEnabled]);

  useEffect(() => {
    const states = new Map<number, PadState>();
    const warnedVibration = new Set<number>();
    const warnedMapping = new Set<number>();
    let connectedValue = false;
    let resetBaseline = true;
    let frame = 0;

    const reset = () => {
      resetBaseline = true;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reset();
      else resetBaseline = true;
    };
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const poll = () => {
      const pads = navigator.getGamepads();
      const now = performance.now();
      let anyConnected = false;

      for (let index = 0; index < pads.length; index++) {
        const pad = pads[index];
        if (!pad) continue;
        anyConnected = true;

        const active =
          enabledRef.current &&
          document.hasFocus() &&
          document.visibilityState === "visible";
        let state = states.get(pad.index);
        const isNew = !state;
        if (!state) {
          state = createPadState();
          states.set(pad.index, state);
        }
        if (!active) {
          if (state.backPressedAt !== null || state.lastBackProgress >= 0)
            backHoldRef.current?.(0);
          seedBaseline(pad, state, now);
          resetBaseline = true;
          continue;
        }

        if (pad.mapping !== "standard" && !warnedMapping.has(pad.index)) {
          warnedMapping.add(pad.index);
          console.warn(
            `[Nyx gamepad] ${pad.id} uses non-standard mapping (${pad.mapping || "unmapped"}).`,
          );
          noticeRef.current?.(
            `Controller layout is non-standard (${pad.id}); some buttons may behave differently.`,
          );
        }

        if (isNew) {
          seedBaseline(pad, state, now);
          continue;
        }

        if (process.env.NODE_ENV !== "production") {
          const changedButtons: string[] = [];
          for (let buttonIndex = 0; buttonIndex < pad.buttons.length; buttonIndex++) {
            const value = pad.buttons[buttonIndex].value;
            if (Math.abs(value - (state.previousValues[buttonIndex] ?? 0)) >= 0.25)
              changedButtons.push(`${buttonIndex}:${value.toFixed(1)}`);
            state.previousValues[buttonIndex] = value;
          }
          state.previousValues.length = pad.buttons.length;
          if (changedButtons.length)
            console.info(
              `[Nyx gamepad] ${pad.id} mapping=${pad.mapping || "unmapped"} buttons=${changedButtons.join(",")}`,
            );
        }

        if (resetBaseline) {
          if (state.backPressedAt !== null || state.lastBackProgress >= 0)
            backHoldRef.current?.(0);
          seedBaseline(pad, state, now);
          continue;
        }

        for (let buttonIndex = 0; buttonIndex < pad.buttons.length; buttonIndex++) {
          const pressed = pad.buttons[buttonIndex].pressed;
          if (pressed && !state.buttons.has(buttonIndex)) {
            state.buttons.add(buttonIndex);
            const action = BUTTON_ACTIONS[buttonIndex];
            if (action)
              dispatchAction(pad, action, actionRef, vibrationRef, warnedVibration);
            if (buttonIndex === 1) {
              state.backPressedAt = now;
              state.backCloseFired = false;
              state.lastBackProgress = -1;
            }
          } else if (!pressed) {
            if (buttonIndex === 1 && state.buttons.has(buttonIndex)) {
              state.backPressedAt = null;
              state.backCloseFired = false;
              state.lastBackProgress = -1;
              backHoldRef.current?.(0);
            }
            state.buttons.delete(buttonIndex);
          }
        }

        if (state.buttons.has(1) && state.backPressedAt !== null) {
          const heldFor = now - state.backPressedAt;
          if (heldFor >= BACK_CLOSE_INDICATOR_DELAY_MS) {
            const progress = Math.min(
              1,
              (heldFor - BACK_CLOSE_INDICATOR_DELAY_MS) /
                (BACK_CLOSE_HOLD_MS - BACK_CLOSE_INDICATOR_DELAY_MS),
            );
            const progressStep = Math.floor(progress * 50);
            if (progressStep !== state.lastBackProgress) {
              state.lastBackProgress = progressStep;
              backHoldRef.current?.(progress);
            }
          }
          if (heldFor >= BACK_CLOSE_HOLD_MS && !state.backCloseFired) {
            state.backCloseFired = true;
            if (state.lastBackProgress !== 50) {
              state.lastBackProgress = 50;
              backHoldRef.current?.(1);
            }
          }
        }

        state.axisX = updateAxis(state.axisX, pad.axes[0] ?? 0);
        state.axisY = updateAxis(state.axisY, pad.axes[1] ?? 0);
        updateRepeat(pad, state, "left", state.buttons.has(14) || state.axisX < 0, now, actionRef, vibrationRef, warnedVibration);
        updateRepeat(pad, state, "right", state.buttons.has(15) || state.axisX > 0, now, actionRef, vibrationRef, warnedVibration);
        updateRepeat(pad, state, "up", state.buttons.has(12) || state.axisY < 0, now, actionRef, vibrationRef, warnedVibration);
        updateRepeat(pad, state, "down", state.buttons.has(13) || state.axisY > 0, now, actionRef, vibrationRef, warnedVibration);
      }

      for (const padIndex of states.keys()) {
        if (pads[padIndex]) continue;
        states.delete(padIndex);
        warnedVibration.delete(padIndex);
        warnedMapping.delete(padIndex);
      }
      if (anyConnected !== connectedValue) {
        connectedValue = anyConnected;
        setConnected(anyConnected);
      }
      resetBaseline = !enabledRef.current;
      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return connected;
}
