"use client";

import { useEffect, useMemo, useState } from "react";

function isSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function SignaturBridge({ signingUrl }: { signingUrl: string }) {
  const [countdown, setCountdown] = useState(2);
  const isValid = useMemo(() => isSafeUrl(signingUrl), [signingUrl]);

  useEffect(() => {
    if (!isValid) return;

    const tick = window.setInterval(() => {
      setCountdown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    const redirect = window.setTimeout(() => {
      window.location.assign(signingUrl);
    }, 1800);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(redirect);
    };
  }, [isValid, signingUrl]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top, rgba(39,196,157,0.14), transparent 35%), #0f1514",
        color: "#eef4f1",
        padding: "32px 18px",
        fontFamily: "'Hanken Grotesk', sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(19, 27, 26, 0.94)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 28,
          padding: "34px 28px",
          boxShadow: "0 28px 80px -36px rgba(0,0,0,0.75)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 12px",
            borderRadius: 999,
            background: "rgba(54, 205, 167, 0.12)",
            color: "#6fe0c6",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Anima Cura
        </div>

        <h1
          style={{
            margin: "20px 0 10px",
            fontFamily: "'Fraunces', serif",
            fontSize: 34,
            lineHeight: 1.04,
            fontWeight: 600,
            letterSpacing: "-0.03em",
          }}
        >
          Ihre Unterschrift wird jetzt sicher geöffnet.
        </h1>

        <p style={{ margin: 0, color: "#a7b6b0", fontSize: 16, lineHeight: 1.6 }}>
          Sie bleiben im Anima-Cura-Prozess. Im nächsten Schritt bestätigen Sie nur noch
          Ihre Unterschrift für den Anamnesebogen und werden danach automatisch wieder
          zurückgeführt.
        </p>

        <div
          style={{
            marginTop: 22,
            padding: "16px 18px",
            borderRadius: 18,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 13, color: "#8fa09a", marginBottom: 6 }}>
            Nächster Schritt
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Digitale Unterschrift des Anamnesebogens
          </div>
          {isValid ? (
            <div style={{ marginTop: 10, color: "#6fe0c6", fontSize: 14 }}>
              Weiterleitung in {countdown}…
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "#ff9c8f", fontSize: 14 }}>
              Die Signatur konnte nicht vorbereitet werden. Bitte laden Sie die Seite neu.
            </div>
          )}
        </div>

        {isValid && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <button
              type="button"
              onClick={() => window.location.assign(signingUrl)}
              style={{
                border: 0,
                borderRadius: 14,
                padding: "13px 18px",
                background: "linear-gradient(135deg, #67e0c0, #27c49d)",
                color: "#0f1715",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Jetzt zur Unterschrift
            </button>
            <a
              href={signingUrl}
              style={{
                borderRadius: 14,
                padding: "13px 18px",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#eef4f1",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Falls nichts passiert, hier tippen
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
