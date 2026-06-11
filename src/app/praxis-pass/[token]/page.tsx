import { notFound } from "next/navigation";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import PraxisPass from "@/app/scribe/praxis-pass/PraxisPass";
import "@/app/scribe/scribe.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--schrift-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--schrift-text" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--schrift-mono" });

export const dynamic = "force-dynamic";
export const metadata = { title: "Anima Scribe · Praxis-Pass" };

// Oeffentlicher, tokengeschuetzter Zugang. Kein Login. Nur wer den Link hat, kommt rein.
export default function PraxisPassTokenPage({ params }: { params: { token: string } }) {
  const erlaubt = process.env.PRAXIS_PASS_TOKEN;
  if (!erlaubt || params.token !== erlaubt) notFound();

  return (
    <div className={`scribe pp-host ${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}
         style={{ fontFamily: "var(--schrift-text), system-ui, sans-serif" }}>
      <PraxisPass nutzerName="Praxis" token={params.token} />
    </div>
  );
}
