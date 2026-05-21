"use client";

import { useEffect, useState } from "react";
import { useICura } from "./useICura";

interface Rect { top: number; left: number; width: number; height: number }

/**
 * Global overlay that, when a CSS selector is requested via the store,
 * draws a pulsing ring around the first matching element and re-tracks
 * it on scroll / resize. Click anywhere to dismiss.
 */
export function ICuraHighlight() {
  const selector = useICura((s) => s.highlightSelector);
  const explanation = useICura((s) => s.highlightExplanation);
  const clear = useICura((s) => s.clearHighlight);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const update = () => {
      let el: Element | null = null;
      try { el = document.querySelector(selector); } catch { /* invalid selector */ }
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      // Wait one frame so we measure post-scroll
      requestAnimationFrame(() => {
        const r = el!.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };
    update();
    const onUpd = () => update();
    window.addEventListener("scroll", onUpd, true);
    window.addEventListener("resize", onUpd);
    const interval = window.setInterval(update, 600);
    return () => {
      window.removeEventListener("scroll", onUpd, true);
      window.removeEventListener("resize", onUpd);
      window.clearInterval(interval);
    };
  }, [selector]);

  if (!selector || !rect) return null;

  return (
    <div className="icura-highlight-root" onClick={clear} aria-hidden>
      <div
        className="icura-highlight-ring"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
      />
      {explanation && (
        <div
          className="icura-highlight-callout"
          style={{
            top: rect.top + rect.height + 14,
            left: Math.max(12, rect.left + rect.width / 2),
          }}
        >
          {explanation}
        </div>
      )}
    </div>
  );
}
