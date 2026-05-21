"use client";

import { useEffect, useState } from "react";

/**
 * Animated background for the automations portal page.
 * Pure CSS — three layers: floating particles, animated mesh, scan line.
 * Honors prefers-reduced-motion.
 */
export function AutomationPortalBackground() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Pre-computed particle positions for stable SSR/CSR match
  const particles = [
    { l: 8, t: 12, d: 0, dur: 24, size: 3 },
    { l: 22, t: 78, d: 6, dur: 30, size: 2 },
    { l: 36, t: 28, d: 12, dur: 26, size: 4 },
    { l: 48, t: 62, d: 2, dur: 32, size: 2 },
    { l: 62, t: 18, d: 8, dur: 28, size: 3 },
    { l: 74, t: 70, d: 4, dur: 34, size: 2 },
    { l: 86, t: 34, d: 14, dur: 26, size: 3 },
    { l: 18, t: 48, d: 10, dur: 30, size: 2 },
    { l: 54, t: 88, d: 0, dur: 36, size: 4 },
    { l: 92, t: 8, d: 7, dur: 28, size: 2 },
    { l: 30, t: 92, d: 16, dur: 32, size: 3 },
    { l: 78, t: 54, d: 3, dur: 26, size: 2 },
  ];

  return (
    <div className="portal-bg" aria-hidden>
      <div className="portal-bg-mesh" />
      <div className="portal-bg-grid" />
      <div className="portal-bg-orb portal-bg-orb-1" />
      <div className="portal-bg-orb portal-bg-orb-2" />
      <div className="portal-bg-orb portal-bg-orb-3" />
      <div className="portal-bg-scan" />
      {mounted && particles.map((p, i) => (
        <span
          key={i}
          className="portal-particle"
          style={{
            left: `${p.l}%`,
            top: `${p.t}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.d}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
