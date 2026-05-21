"use client";

import { useEffect, useRef } from "react";

/**
 * Applies a subtle mouse-tracked 3D tilt to the element.
 * Disabled when prefers-reduced-motion is on.
 */
export function useTilt<T extends HTMLElement>(intensity = 8) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let raf = 0;
    function onMove(e: MouseEvent) {
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty("--tilt-x", `${-y * intensity}deg`);
        el.style.setProperty("--tilt-y", `${x * intensity}deg`);
        el.style.setProperty("--tilt-mx", `${(x + 0.5) * 100}%`);
        el.style.setProperty("--tilt-my", `${(y + 0.5) * 100}%`);
      });
    }
    function onLeave() {
      if (!el) return;
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      el.style.setProperty("--tilt-mx", "50%");
      el.style.setProperty("--tilt-my", "50%");
    }

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [intensity]);

  return ref;
}
