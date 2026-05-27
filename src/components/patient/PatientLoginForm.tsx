"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";

export default function PatientLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("E-Mail oder Passwort ist falsch.");
      setLoading(false);
      return;
    }

    // Verify this is a patient account
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, patient_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.role !== "patient" || !profile.patient_id) {
        await supabase.auth.signOut();
        setError("Dieses Konto ist kein Patienten-Zugang.");
        setLoading(false);
        return;
      }
    }

    router.replace("/patient/portal");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#000",
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              fontFamily: "'Fraunces', serif",
            }}
          >
            A
          </div>
          <span
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 28,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Anima Cura
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#111",
            borderRadius: 24,
            border: "1px solid #222",
            padding: "36px 28px",
          }}
        >
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            Patientenportal
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#666",
              textAlign: "center",
              marginBottom: 28,
            }}
          >
            Melde dich mit deinen Zugangsdaten an
          </p>

          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 20,
                fontSize: 13,
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#666",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                E-Mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "#0a0a0a",
                  border: "1px solid #222",
                  color: "#fff",
                  fontSize: 15,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#666",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Passwort
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "14px 48px 14px 16px",
                    borderRadius: 14,
                    background: "#0a0a0a",
                    border: "1px solid #222",
                    color: "#fff",
                    fontSize: 15,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#555",
                    fontSize: 14,
                  }}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: 16,
                borderRadius: 14,
                border: "none",
                background: "#22c55e",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                fontFamily: "inherit",
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Wird geladen..." : "Anmelden"}
            </button>
          </form>
        </div>

        <p
          style={{
            fontSize: 12,
            color: "#333",
            textAlign: "center",
            marginTop: 24,
          }}
        >
          Zugangsdaten erhältst du in deiner Praxis.
        </p>
      </div>

      {/* Font import */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap');`}</style>
    </div>
  );
}
