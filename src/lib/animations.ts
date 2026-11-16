"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

export function useStartupAnimation(onComplete: () => void, reducedMotion: boolean) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!scope.current) return;
    if (reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    gsap.set(".intro-icon", { scale: 0.72, opacity: 0, filter: "brightness(.8)" });
    gsap.set(".intro-label", { opacity: 0, y: 8 });
    const timeline = gsap.timeline({ onComplete });
    timeline.to(".intro-icon", { scale: 1, opacity: 1, filter: "brightness(1.2)", duration: 0.7, ease: "power3.out" })
      .to(".intro-icon", { filter: "brightness(1)", duration: 0.5, ease: "sine.out" }, "<0.35")
      .to(".intro-label", { opacity: 1, y: 0, duration: 0.35 }, "<0.05")
      .to(scope.current, { opacity: 0, duration: 0.55, ease: "power2.inOut" }, ">0.45");
    return () => timeline.kill();
  }, { scope, dependencies: [reducedMotion] });
  return scope;
}
