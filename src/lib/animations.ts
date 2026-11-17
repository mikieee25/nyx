"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef } from "react";

gsap.registerPlugin(useGSAP);

function bezierEase(x1: number, y1: number, x2: number, y2: number) {
  const curve = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (progress: number) => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (curve(mid, x1, x2) < progress) low = mid;
      else high = mid;
    }
    return curve((low + high) / 2, y1, y2);
  };
}

export function useStartupAnimation(
  onComplete: () => void,
  reducedMotion: boolean,
  active: boolean,
  ready: boolean,
) {
  const scope = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (ready) timelineRef.current?.resume();
  }, [ready]);

  useGSAP(
    () => {
      if (!active) return;
      if (!scope.current) return;
      if (
        reducedMotion ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        onComplete();
        return;
      }
      const select = gsap.utils.selector(scope.current);
      const tileEase = bezierEase(0.2, 0.8, 0.2, 1);
      const popEase = bezierEase(0.2, 0.9, 0.3, 1.25);
      const easeOut = bezierEase(0, 0, 0.58, 1);
      const easeInOut = bezierEase(0.42, 0, 0.58, 1);
      const loadEase = bezierEase(0.5, 0, 0.2, 1);
      const buttons = select(".intro-button");
      const liftDistance = Math.min(
        48,
        Math.max(30, Math.min(window.innerWidth, window.innerHeight) * 0.06),
      );
      const timeline = gsap.timeline({ onComplete });
      timelineRef.current = timeline;
      timeline
        .to(
          select(".intro-ambient"),
          { opacity: 1, duration: 1.2, ease: easeOut },
          0,
        )
        .fromTo(
          select(".intro-tile"),
          { scale: 0.82, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.8, ease: tileEase },
          0,
        )
        .fromTo(
          select(".intro-ring"),
          { scale: 0.14, opacity: 0.8 },
          {
            scale: 1,
            opacity: 0,
            duration: 1,
            ease: easeOut,
            immediateRender: false,
          },
          1.7,
        )
        .fromTo(
          select(".intro-sweep"),
          { x: -260 },
          { x: 760, duration: 0.9, ease: easeInOut, immediateRender: false },
          1.8,
        )
        .fromTo(
          select(".intro-mark"),
          { y: liftDistance },
          { y: 0, duration: 0.9, ease: tileEase, immediateRender: false },
          2,
        )
        .fromTo(
          select(".intro-letter"),
          { y: 14, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.12,
            ease: tileEase,
            immediateRender: false,
          },
          2.1,
        )
        .to(
          select(".intro-tag"),
          { opacity: 1, duration: 0.8, ease: easeOut },
          2.8,
        )
        .to(
          select(".intro-progress"),
          { opacity: 1, duration: 0.4, ease: easeOut },
          3.1,
        )
        .to(
          select(".intro-progress i"),
          { scaleX: 1, duration: 1.2, ease: loadEase },
          3.2,
        )
        .call(() => {
          if (!readyRef.current) timeline.pause();
        }, undefined, 4.5)
        .to(scope.current, { opacity: 0, duration: 0.4, ease: easeInOut }, 4.6);
      buttons.forEach((button, index) => {
        const start = 0.5 + index * 0.12;
        timeline
          .fromTo(
            button,
            { scale: 0, opacity: 0 },
            {
              scale: 1.15,
              opacity: 1,
              duration: 0.39,
              ease: popEase,
              immediateRender: false,
            },
            start,
          )
          .to(
            button,
            { scale: 1, duration: 0.26, ease: popEase },
            start + 0.39,
          );
      });
      timeline
        .fromTo(
          select(".intro-pad"),
          { scale: 0, opacity: 0 },
          {
            scale: 1.15,
            opacity: 1,
            duration: 0.42,
            ease: popEase,
            transformOrigin: "center",
            immediateRender: false,
          },
          1.15,
        )
        .to(
          select(".intro-pad"),
          { scale: 1, duration: 0.28, ease: popEase },
          1.57,
        );
      return () => {
        timeline.kill();
        if (timelineRef.current === timeline) timelineRef.current = null;
      };
    },
    { scope, dependencies: [active, reducedMotion], revertOnUpdate: true },
  );
  return scope;
}
