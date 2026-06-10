import type { ReactNode } from "react";
import { Fraunces, Source_Sans_3, Spline_Sans_Mono } from "next/font/google";
import "./scribe.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--schrift-display" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--schrift-text" });
const splineMono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--schrift-mono" });

export const metadata = { title: "Anima Scribe" };

// Anima Scribe: eigenes Gesicht, gleicher Kern.
// Auth wird in den Seiten geprueft (Login-Seite muss ohne Session erreichbar sein).
export default function ScribeLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`scribe ${fraunces.variable} ${sourceSans.variable} ${splineMono.variable}`}
      style={{ fontFamily: "var(--schrift-text), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
