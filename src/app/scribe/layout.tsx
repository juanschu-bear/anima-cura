import type { ReactNode } from "react";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import ScribeShell from "./ScribeShell";
import "./scribe.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--schrift-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--schrift-text" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--schrift-mono" });

export const metadata = { title: "Anima Scribe · Behandlungscockpit" };

export default function ScribeLayout({ children }: { children: ReactNode }) {
  return (
    <ScribeShell fontKlassen={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}>
      {children}
    </ScribeShell>
  );
}
