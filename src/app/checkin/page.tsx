"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/db/supabase";

/**
 * /app/checkin/page.tsx
 *
 * Patient Check-in Screen fur AnimaHost.
 * Der Patient kommt hierher via:
 * - Push Notification (BLE Beacon / Geofencing)
 * - Direkter Link in der App
 * - QR-Code am Display
 *
 * Flow:
 * 1. Auth checken (Patient muss eingeloggt sein)
 * 2. Heutigen Termin laden
 * 3. "Einchecken" Button
 * 4. Nach Check-in: Bestätigung + ggf. Aktionen
 */

interface Termin {
  id: string;
  uhrzeit: string;
  behandler: string;
  behandlung_art: string | null;
}

interface Aktionen {
  chipkarte_faellig: boolean;
  anamnesebogen_ausstehend: boolean;
  offener_betrag: number;
}

interface CheckinResult {
  success: boolean;
  termin: Termin;
  aktionen: Aktionen;
}

type PageState = "loading" | "ready" | "no_termin" | "checked_in" | "error";

export default function CheckinPage() {
  const supabase = createBrowserClient();
  const [state, setState] = useState<PageState>("loading");
  const [termin, setTermin] = useState<Termin | null>(null);
  const [aktionen, setAktionen] = useState<Aktionen | null>(null);
  const [patientName, setPatientName] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadTermin();
  }, []);

  async function loadTermin() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login?redirect=/checkin";
        return;
      }

      // Patient-Profil holen
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("patient_id, vorname, nachname")
        .eq("user_id", session.user.id)
        .single();

      if (!profile?.patient_id) {
        setState("no_termin");
        return;
      }

      setPatientName(profile.vorname || "");

      // Heutigen Termin prüfen
      const today = new Date().toISOString().split("T")[0];
      const { data: termine } = await supabase
        .from("tagesplan_termine")
        .select("*")
        .eq("patient_id", profile.patient_id)
        .eq("datum", today)
        .eq("status", "erwartet")
        .order("uhrzeit", { ascending: true })
        .limit(1);

      if (!termine || termine.length === 0) {
        // Vielleicht schon eingecheckt?
        const { data: eingecheckt } = await supabase
          .from("tagesplan_termine")
          .select("*")
          .eq("patient_id", profile.patient_id)
          .eq("datum", today)
          .eq("status", "eingecheckt")
          .limit(1);

        if (eingecheckt && eingecheckt.length > 0) {
          setTermin({
            id: eingecheckt[0].id,
            uhrzeit: eingecheckt[0].uhrzeit,
            behandler: eingecheckt[0].behandler,
            behandlung_art: eingecheckt[0].behandlung_art,
          });
          setState("checked_in");
          return;
        }

        setState("no_termin");
        return;
      }

      setTermin({
        id: termine[0].id,
        uhrzeit: termine[0].uhrzeit,
        behandler: termine[0].behandler,
        behandlung_art: termine[0].behandlung_art,
      });
      setState("ready");
    } catch (err) {
      console.error("[checkin] Load error:", err);
      setState("error");
    }
  }

  async function handleCheckin() {
    if (!termin || checking) return;
    setChecking(true);

    try {
      const res = await fetch("/api/patient/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: termin.id,
          via: "qr_scan",
        }),
      });

      // Patient-ID aus Profil holen fur den API Call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("patient_id")
        .eq("user_id", session.user.id)
        .single();

      const checkinRes = await fetch("/api/patient/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: profile?.patient_id,
          via: "qr_scan",
        }),
      });

      if (!checkinRes.ok) {
        throw new Error("Check-in fehlgeschlagen");
      }

      const result: CheckinResult = await checkinRes.json();
      setAktionen(result.aktionen);
      setState("checked_in");
    } catch (err) {
      console.error("[checkin] Error:", err);
      setState("error");
    } finally {
      setChecking(false);
    }
  }

  function formatUhrzeit(time: string): string {
    return time.slice(0, 5) + " Uhr";
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo / Praxis Header */}
        <div style={styles.header}>
          <div style={styles.logo}>Praxis Dr. Schubert</div>
          <div style={styles.subtitle}>Kieferorthopädie Leipzig</div>
        </div>

        {/* Loading */}
        {state === "loading" && (
          <div style={styles.content}>
            <div style={styles.spinner} />
            <p style={styles.text}>Termin wird geladen...</p>
          </div>
        )}

        {/* Kein Termin */}
        {state === "no_termin" && (
          <div style={styles.content}>
            <p style={styles.textLarge}>
              {patientName ? `Hallo ${patientName}!` : "Hallo!"}
            </p>
            <p style={styles.text}>
              Fur heute ist kein Termin hinterlegt.
              Falls Sie einen Termin haben, melden Sie sich
              bitte an der Rezeption.
            </p>
          </div>
        )}

        {/* Termin gefunden, bereit zum Einchecken */}
        {state === "ready" && termin && (
          <div style={styles.content}>
            <p style={styles.textLarge}>
              {patientName ? `Hallo ${patientName}!` : "Willkommen!"}
            </p>

            <div style={styles.terminBox}>
              <div style={styles.terminZeit}>
                {formatUhrzeit(termin.uhrzeit)}
              </div>
              <div style={styles.terminDetail}>
                {termin.behandler}
              </div>
              {termin.behandlung_art && (
                <div style={styles.terminDetail}>
                  {termin.behandlung_art}
                </div>
              )}
            </div>

            <button
              onClick={handleCheckin}
              disabled={checking}
              style={{
                ...styles.checkinButton,
                opacity: checking ? 0.7 : 1,
              }}
            >
              {checking ? "Wird eingecheckt..." : "Einchecken"}
            </button>
          </div>
        )}

        {/* Eingecheckt */}
        {state === "checked_in" && termin && (
          <div style={styles.content}>
            <div style={styles.checkmark}>✓</div>
            <p style={styles.textLarge}>Eingecheckt!</p>
            <p style={styles.text}>
              Ihr Termin um {formatUhrzeit(termin.uhrzeit)} ist bestätigt.
              Nehmen Sie gerne Platz.
            </p>

            {/* Aktionen anzeigen falls nötig */}
            {aktionen && (
              <div style={styles.aktionen}>
                {aktionen.chipkarte_faellig && (
                  <div style={styles.aktionItem}>
                    <span style={styles.aktionIcon}>🪪</span>
                    <span>Bitte halten Sie Ihre Versichertenkarte bereit.</span>
                  </div>
                )}
                {aktionen.anamnesebogen_ausstehend && (
                  <div style={styles.aktionItem}>
                    <span style={styles.aktionIcon}>📋</span>
                    <a href="/anima-sign" style={styles.aktionLink}>
                      Anamnesebogen jetzt ausfüllen
                    </a>
                  </div>
                )}
                {aktionen.offener_betrag > 0 && (
                  <div style={styles.aktionItem}>
                    <span style={styles.aktionIcon}>💳</span>
                    <a href="/patient/balance" style={styles.aktionLink}>
                      Offener Betrag: {aktionen.offener_betrag.toFixed(2)} €
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fehler */}
        {state === "error" && (
          <div style={styles.content}>
            <p style={styles.textLarge}>Etwas ist schiefgelaufen</p>
            <p style={styles.text}>
              Bitte melden Sie sich an der Rezeption.
            </p>
            <button
              onClick={() => { setState("loading"); loadTermin(); }}
              style={styles.retryButton}
            >
              Nochmal versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Inline Styles (kein Tailwind-Dependency fur PWA-Standalone)
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    borderRadius: "20px",
    background: "#ffffff",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
    overflow: "hidden",
  },
  header: {
    padding: "32px 24px 24px",
    textAlign: "center" as const,
    borderBottom: "1px solid #f0f0f0",
  },
  logo: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#1a1a2e",
    letterSpacing: "-0.3px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
    marginTop: "4px",
  },
  content: {
    padding: "32px 24px",
    textAlign: "center" as const,
  },
  textLarge: {
    fontSize: "22px",
    fontWeight: 600,
    color: "#1a1a2e",
    margin: "0 0 12px 0",
  },
  text: {
    fontSize: "15px",
    color: "#6b7280",
    lineHeight: 1.6,
    margin: "0 0 8px 0",
  },
  terminBox: {
    background: "#f8f9fa",
    borderRadius: "12px",
    padding: "20px",
    margin: "24px 0",
  },
  terminZeit: {
    fontSize: "28px",
    fontWeight: 700,
    color: "#1a1a2e",
    marginBottom: "8px",
  },
  terminDetail: {
    fontSize: "15px",
    color: "#6b7280",
    marginTop: "4px",
  },
  checkinButton: {
    width: "100%",
    padding: "18px",
    fontSize: "18px",
    fontWeight: 600,
    color: "#ffffff",
    background: "#2563eb",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    marginTop: "8px",
    transition: "opacity 0.2s",
  },
  checkmark: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#22c55e",
    color: "#ffffff",
    fontSize: "32px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
  },
  aktionen: {
    marginTop: "24px",
    textAlign: "left" as const,
  },
  aktionItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    background: "#fefce8",
    borderRadius: "10px",
    marginBottom: "8px",
    fontSize: "14px",
    color: "#1a1a2e",
  },
  aktionIcon: {
    fontSize: "20px",
    flexShrink: 0,
  },
  aktionLink: {
    color: "#2563eb",
    textDecoration: "underline",
    fontWeight: 500,
  },
  retryButton: {
    padding: "14px 28px",
    fontSize: "15px",
    fontWeight: 500,
    color: "#2563eb",
    background: "transparent",
    border: "2px solid #2563eb",
    borderRadius: "12px",
    cursor: "pointer",
    marginTop: "16px",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #2563eb",
    borderRadius: "50%",
    margin: "0 auto 16px",
    animation: "spin 0.8s linear infinite",
  },
};
