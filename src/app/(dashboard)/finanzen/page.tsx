"use client";

// ============================================================
// FINANZEN – Die Messstation
// ============================================================
// Alle gemessenen Geldstroeme aus den Kontodaten auf einer
// Seite. Einzige Datenquelle: ac_finanz_messwerte() (RPC),
// damit Frontend und SQL garantiert dieselben Zahlen zeigen.
// ============================================================

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { CardSkeleton } from "@/components/ui";
import {
  Landmark,
  CreditCard,
  Users,
  Receipt,
  ShieldAlert,
  ArrowLeftRight,
} from "lucide-react";

interface Zaehler {
  anzahl: number;
  summe: number;
}

interface Messwerte {
  stand: string;
  eingaenge: Zaehler;
  kzv: Zaehler;
  umbuchungen: Zaehler;
  terminal: Zaehler & {
    offen_anzahl: number;
    offen_summe: number;
    abgeglichen_anzahl: number;
    abgeglichen_summe: number;
    kreditkarte: { brutto: number; einbehalten: number; prozent: number };
  };
  patientengeld: {
    bestaetigt: Zaehler;
    vorschlag: Zaehler;
    unklar: Zaehler;
  };
  posten: {
    offen_anzahl: number;
    offen_summe: number;
    teilbezahlt_anzahl: number;
    teilbezahlt_summe: number;
    mahnschutz_anzahl: number;
  };
  geldstatus: {
    harte_kandidaten: Zaehler;
    einstufungen: Record<string, Zaehler>;
  };
}

function euro(value: number, locale: string): string {
  return `${value.toLocaleString(locale === "en" ? "en-GB" : "de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}\u00A0€`;
}

function zahl(value: number, locale: string): string {
  return value.toLocaleString(locale === "en" ? "en-GB" : "de-DE");
}

function FinCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "red" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "text-accent-emerald"
      : tone === "amber"
      ? "text-accent-amber"
      : tone === "red"
      ? "text-accent-red"
      : tone === "blue"
      ? "text-accent-blue"
      : "";
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-xs text-praxis-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-praxis-400">{sub}</div> : null}
    </div>
  );
}

function Abschnitt({
  icon: Icon,
  titel,
  hinweis,
  children,
}: {
  icon: typeof Landmark;
  titel: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-praxis-400" />
        <h2 className="text-sm font-semibold">{titel}</h2>
        {hinweis ? <span className="text-xs text-praxis-400">· {hinweis}</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

export default function FinanzenPage() {
  const { locale } = useAppStore();
  const [werte, setWerte] = useState<Messwerte | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .rpc("ac_finanz_messwerte")
      .then(({ data, error }) => {
        if (error) {
          setFehler(error.message);
        } else {
          setWerte(data as Messwerte);
        }
      });
  }, []);

  if (fehler) {
    return (
      <div className="rounded-lg border px-4 py-3 text-sm text-accent-red">
        {t("fin.loadError", locale)}: {fehler}
      </div>
    );
  }

  if (!werte) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const patientengeldSumme =
    werte.patientengeld.bestaetigt.summe +
    werte.patientengeld.vorschlag.summe +
    werte.patientengeld.unklar.summe;
  const zugeordnetQuote =
    patientengeldSumme > 0
      ? Math.round((werte.patientengeld.bestaetigt.summe / patientengeldSumme) * 100)
      : 0;

  const einstufungen = Object.entries(werte.geldstatus.einstufungen).sort(
    (a, b) => b[1].summe - a[1].summe
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">{t("fin.title", locale)}</h1>
        <p className="text-sm text-praxis-400">{t("fin.subtitle", locale)}</p>
      </div>

      <Abschnitt icon={Landmark} titel={t("fin.totalSection", locale)}>
        <FinCard
          label={t("fin.allIncoming", locale)}
          value={euro(werte.eingaenge.summe, locale)}
          sub={`${zahl(werte.eingaenge.anzahl, locale)} ${t("fin.bookings", locale)}`}
        />
        <FinCard
          label={t("fin.kzv", locale)}
          value={euro(werte.kzv.summe, locale)}
          sub={`${zahl(werte.kzv.anzahl, locale)} ${t("fin.bookings", locale)}`}
        />
        <FinCard
          label={t("fin.transfers", locale)}
          value={euro(werte.umbuchungen.summe, locale)}
          sub={`${zahl(werte.umbuchungen.anzahl, locale)} ${t("fin.bookings", locale)}`}
        />
        <FinCard
          label={t("fin.patientMoney", locale)}
          value={euro(patientengeldSumme, locale)}
          sub={t("fin.patientMoneySub", locale)}
          tone="blue"
        />
      </Abschnitt>

      <Abschnitt
        icon={Users}
        titel={t("fin.matchingSection", locale)}
        hinweis={`${zugeordnetQuote}% ${t("fin.confirmedShare", locale)}`}
      >
        <FinCard
          label={t("fin.confirmed", locale)}
          value={euro(werte.patientengeld.bestaetigt.summe, locale)}
          sub={`${zahl(werte.patientengeld.bestaetigt.anzahl, locale)} ${t("fin.payments", locale)}`}
          tone="green"
        />
        <FinCard
          label={t("fin.suggested", locale)}
          value={euro(werte.patientengeld.vorschlag.summe, locale)}
          sub={`${zahl(werte.patientengeld.vorschlag.anzahl, locale)} ${t("fin.payments", locale)}`}
          tone="amber"
        />
        <FinCard
          label={t("fin.unclear", locale)}
          value={euro(werte.patientengeld.unklar.summe, locale)}
          sub={`${zahl(werte.patientengeld.unklar.anzahl, locale)} ${t("fin.payments", locale)}`}
        />
      </Abschnitt>

      <Abschnitt
        icon={CreditCard}
        titel={t("fin.terminalSection", locale)}
        hinweis={t("fin.terminalHint", locale)}
      >
        <FinCard
          label={t("fin.terminalTotal", locale)}
          value={euro(werte.terminal.summe, locale)}
          sub={`${zahl(werte.terminal.anzahl, locale)} ${t("fin.bundles", locale)}`}
        />
        <FinCard
          label={t("fin.terminalOpen", locale)}
          value={euro(werte.terminal.offen_summe, locale)}
          sub={`${zahl(werte.terminal.offen_anzahl, locale)} ${t("fin.bundles", locale)}`}
          tone="amber"
        />
        <FinCard
          label={t("fin.terminalReconciled", locale)}
          value={euro(werte.terminal.abgeglichen_summe, locale)}
          sub={`${zahl(werte.terminal.abgeglichen_anzahl, locale)} ${t("fin.bundles", locale)}`}
          tone="green"
        />
        <FinCard
          label={t("fin.ccFees", locale)}
          value={euro(werte.terminal.kreditkarte.einbehalten, locale)}
          sub={`${werte.terminal.kreditkarte.prozent}% ${t("fin.ccFeesSub", locale)} ${euro(
            werte.terminal.kreditkarte.brutto,
            locale
          )}`}
          tone="red"
        />
      </Abschnitt>

      <Abschnitt icon={Receipt} titel={t("fin.openItemsSection", locale)}>
        <FinCard
          label={t("fin.openItems", locale)}
          value={euro(werte.posten.offen_summe, locale)}
          sub={`${zahl(werte.posten.offen_anzahl, locale)} ${t("fin.items", locale)}`}
          tone="amber"
        />
        <FinCard
          label={t("fin.partiallyPaid", locale)}
          value={euro(werte.posten.teilbezahlt_summe, locale)}
          sub={`${zahl(werte.posten.teilbezahlt_anzahl, locale)} ${t("fin.items", locale)}`}
        />
        <FinCard
          label={t("fin.dunningProtected", locale)}
          value={zahl(werte.posten.mahnschutz_anzahl, locale)}
          sub={t("fin.dunningProtectedSub", locale)}
        />
        <FinCard
          label={t("fin.hardCandidates", locale)}
          value={euro(werte.geldstatus.harte_kandidaten.summe, locale)}
          sub={`${zahl(werte.geldstatus.harte_kandidaten.anzahl, locale)} ${t(
            "fin.patientsLabel",
            locale
          )} · ${t("fin.hardCandidatesSub", locale)}`}
          tone="red"
        />
      </Abschnitt>

      <Abschnitt icon={ShieldAlert} titel={t("fin.statusSection", locale)}>
        {einstufungen.map(([name, wert]) => (
          <FinCard
            key={name}
            label={name}
            value={euro(wert.summe, locale)}
            sub={`${zahl(wert.anzahl, locale)} ${t("fin.patientsLabel", locale)}`}
          />
        ))}
      </Abschnitt>

      <div className="flex items-center gap-2 text-xs text-praxis-400">
        <ArrowLeftRight className="h-3.5 w-3.5" />
        {t("fin.footer", locale)}
      </div>
    </div>
  );
}
