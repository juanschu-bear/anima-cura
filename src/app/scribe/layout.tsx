import type { ReactNode } from "react";
import { spaceGrotesk, inter, jetbrains } from "@/lib/local-fonts";
import ScribeShell from "./ScribeShell";
import "./scribe.css";


export const metadata = {
  title: "Anima Scribe · Behandlungscockpit",
  manifest: "/scribe-manifest.json",
  icons: {
    icon: [
      { url: "/scribe-brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/scribe-brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/scribe-brand/apple-touch-icon.png",
    shortcut: "/scribe-brand/favicon.ico",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Anima Scribe" },
};

export default function ScribeLayout({ children }: { children: ReactNode }) {
  return (
    <ScribeShell fontKlassen={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}>
      {children}
    </ScribeShell>
  );
}
