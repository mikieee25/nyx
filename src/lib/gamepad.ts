"use client";

import { useEffect, useRef, useState } from "react";

export type PadAction = "left" | "right" | "up" | "down" | "confirm" | "back" | "start";

export function useGamepad(onAction: (action: PadAction) => void) {
  const actionRef = useRef(onAction);
  const [connected, setConnected] = useState(false);

  useEffect(() => { actionRef.current = onAction; }, [onAction]);

  useEffect(() => {
    const held = new Map<number, Set<number>>();
    const sync = () => setConnected(Array.from(navigator.getGamepads()).some(Boolean));
    const onConnect = () => sync();
    const onDisconnect = () => sync();
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    sync();

    let frame = 0;
    const poll = () => {
      for (const pad of Array.from(navigator.getGamepads())) {
        if (!pad) continue;
        const prior = held.get(pad.index) ?? new Set<number>();
        const current = new Set(pad.buttons.flatMap((button, index) => button.pressed ? [index] : []));
        const fire = (id: number, action: PadAction) => {
          if (current.has(id) && !prior.has(id)) actionRef.current(action);
        };
        const axisX = Math.abs(pad.axes[0] ?? 0) > 0.65 ? Math.sign(pad.axes[0]) : 0;
        const axisY = Math.abs(pad.axes[1] ?? 0) > 0.65 ? Math.sign(pad.axes[1]) : 0;
        const left = current.has(14) || axisX < 0;
        const right = current.has(15) || axisX > 0;
        const up = current.has(12) || axisY < 0;
        const down = current.has(13) || axisY > 0;
        if (left && !prior.has(14)) actionRef.current("left");
        if (right && !prior.has(15)) actionRef.current("right");
        if (up && !prior.has(12)) actionRef.current("up");
        if (down && !prior.has(13)) actionRef.current("down");
        fire(0, "confirm");
        fire(1, "back");
        fire(9, "start");
        held.set(pad.index, new Set([...current, ...(left ? [14] : []), ...(right ? [15] : []), ...(up ? [12] : []), ...(down ? [13] : [])]));
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  return connected;
}
