"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, AnimatePresence, type Variants } from "framer-motion";
import {
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { pruefeEmail } from "@/lib/validation/feldpruefung";

export default function PatientLoginForm() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFehlt, setEmailFehlt] = useState(false);
  const [passwortFehlt, setPasswortFehlt] = useState(false);

  // ---- Animated "plexus" network background (canvas, client-only) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g: CanvasRenderingContext2D = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number };
    let pts: P[] = [];

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    function resize() {
      if (!canvas) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(80, Math.floor((w * h) / 17000)));
      pts = Array.from({ length: count }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-0.22, 0.22),
        vy: rand(-0.22, 0.22),
      }));
    }

    const LINK_DIST = 140;
    function frame() {
      g.clearRect(0, 0, w, h);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            const a = (1 - d / LINK_DIST) * 0.38;
            g.strokeStyle = `rgba(34,197,94,${a})`;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(pts[i].x, pts[i].y);
            g.lineTo(pts[j].x, pts[j].y);
            g.stroke();
          }
        }
      }

      for (const p of pts) {
        g.fillStyle = "rgba(110,231,183,0.75)";
        g.beginPath();
        g.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        g.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    resize();
    frame(); // renders one static frame when reduced motion is on
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduceMotion]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const eMail = email.trim();
    let eFehler = false;
    let eGrund = "";
    if (!eMail) { eFehler = true; }
    else { const r = pruefeEmail(eMail); if (!r.ok) { eFehler = true; eGrund = r.grund; } }
    const pFehler = !password;
    setEmailFehlt(eFehler);
    setPasswortFehlt(pFehler);
    if (eFehler || pFehler) {
      setError(eFehler && pFehler ? "Bitte E-Mail und Passwort ausfüllen." : eFehler ? (eGrund || "Bitte E-Mail eingeben.") : "Bitte Passwort eingeben.");
      return;
    }
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

  // Entrance container/children - staggered, spring-based, reduced-motion aware.
  const container: Variants = {
    hidden: {},
    show: {
      transition: reduceMotion ? {} : { staggerChildren: 0.1, delayChildren: 0.05 },
    },
  };
  const item: Variants = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 260, damping: 24 },
        },
      };

  return (
    <div className="acl-root">
      {/* Ambient futuristic background - purely decorative, hidden from SR */}
      <div className="acl-bg" aria-hidden="true">
        <div className="acl-aurora acl-aurora-1" />
        <div className="acl-aurora acl-aurora-2" />
        <canvas ref={canvasRef} className="acl-plexus" />
        <div className="acl-vignette" />
        {/* Large brand logo watermark filling the left half - background texture only */}
        <div className="acl-watermark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512-transparent.png" alt="" className="acl-watermark-img" />
        </div>
      </div>

      <motion.div
        className="acl-shell"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* LEFT - empty (logo watermark lives in the background) */}
        <div className="acl-spacer" aria-hidden="true" />

        {/* RIGHT - login */}
        <motion.div className="acl-login" variants={item}>
          <div className="acl-card">
            <div className="acl-card-sheen" aria-hidden="true" />

            <div className="acl-card-head">
              <h1 className="acl-brand-name">Anima Cura</h1>
              <p className="acl-brand-tag">Digitales Patientenportal</p>
            </div>

            <div className="acl-divider" aria-hidden="true" />

            <h2 className="acl-title">Willkommen zurück</h2>
            <p className="acl-subtitle">Melde dich mit deinen Zugangsdaten an</p>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key={error}
                  className="acl-error"
                  role="alert"
                  aria-live="assertive"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, x: [0, -6, 6, -4, 4, 0] }
                  }
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0.15 : 0.4 }}
                >
                  <AlertCircle size={16} strokeWidth={2} className="acl-error-icon" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div className="acl-field">
                <label htmlFor="patient-email" className="acl-label">
                  E-Mail
                </label>
                <div className="acl-input-wrap">
                  <Mail size={18} strokeWidth={1.75} className="acl-input-icon" aria-hidden="true" />
                  <input
                    id="patient-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailFehlt) setEmailFehlt(false); }}
                    placeholder="deine@email.de"
                    className={"acl-input" + (emailFehlt ? " acl-input--fehlt" : "")}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="acl-field">
                <label htmlFor="patient-password" className="acl-label">
                  Passwort
                </label>
                <div className="acl-input-wrap">
                  <LockKeyhole size={18} strokeWidth={1.75} className="acl-input-icon" aria-hidden="true" />
                  <input
                    id="patient-password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (passwortFehlt) setPasswortFehlt(false); }}
                    placeholder="••••••••"
                    className={"acl-input acl-input--pw" + (passwortFehlt ? " acl-input--fehlt" : "")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="acl-toggle"
                    aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
                    aria-pressed={showPw}
                  >
                    {showPw ? (
                      <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                className="acl-submit"
                whileHover={reduceMotion || loading ? undefined : { y: -2 }}
                whileTap={reduceMotion || loading ? undefined : { scale: 0.98 }}
              >
                <span className="acl-submit-shine" aria-hidden="true" />
                {loading ? (
                  <>
                    <Loader2 size={18} className="acl-spin" aria-hidden="true" />
                    Wird geladen…
                  </>
                ) : (
                  "Anmelden"
                )}
              </motion.button>
            </form>
          </div>

          <p className="acl-foot">
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            Zugangsdaten erhältst du in deiner Praxis.
          </p>
        </motion.div>
      </motion.div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap');

        .acl-root {
          position: relative;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          overflow: hidden;
          background: #05070b;
          font-family: 'DM Sans', -apple-system, sans-serif;
          isolation: isolate;
        }

        /* ---------- Ambient background ---------- */
        .acl-bg { position: absolute; inset: 0; z-index: -1; }

        /* Large brand logo watermark filling the LEFT half of the screen -
           pure background texture: very low opacity, low z-index, non-interactive. */
        .acl-watermark {
          position: absolute;
          top: 0; left: 0;
          width: 50%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          padding: 4vw;
          pointer-events: none;
          z-index: 0;
        }
        .acl-watermark-img {
          width: 100%; height: 100%;
          max-width: 720px; max-height: 720px;
          object-fit: contain;
          opacity: 0.14;
        }
        .acl-aurora {
          position: absolute;
          width: 60vmax; height: 60vmax;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.4;
          will-change: transform;
        }
        .acl-aurora-1 {
          top: -24vmax; left: -14vmax;
          background: radial-gradient(circle at center, rgba(34,197,94,0.5), transparent 60%);
          animation: aclDrift1 18s ease-in-out infinite alternate;
        }
        .acl-aurora-2 {
          bottom: -28vmax; right: -18vmax;
          background: radial-gradient(circle at center, rgba(16,185,129,0.38), rgba(13,148,136,0.2) 40%, transparent 65%);
          animation: aclDrift2 22s ease-in-out infinite alternate;
        }
        .acl-plexus {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          opacity: 0.9;
        }
        .acl-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 90% 90% at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%);
          z-index: 2;
        }

        /* ---------- Split shell ---------- */
        .acl-shell {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: stretch;
          gap: 28px;
          width: 100%;
          max-width: 940px;
        }

        /* ---------- LEFT: empty spacer (logo watermark fills this half) ---------- */
        .acl-spacer { display: block; }

        /* ---------- RIGHT: login ---------- */
        .acl-login {
          width: 100%;
          display: flex; flex-direction: column; justify-content: center;
        }

        /* ---------- Card (glassmorphism) ---------- */
        .acl-card {
          position: relative;
          background: linear-gradient(160deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025));
          backdrop-filter: blur(26px) saturate(150%);
          -webkit-backdrop-filter: blur(26px) saturate(150%);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 24px;
          padding: 32px 30px;
          box-shadow: 0 30px 70px -24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
          overflow: hidden;
        }
        .acl-card-sheen {
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(34,197,94,0.85), transparent);
        }

        .acl-card-head { margin-bottom: 18px; }
        .acl-brand-name {
          font-family: 'Fraunces', serif; font-size: 28px; font-weight: 700;
          color: #fff; letter-spacing: -0.02em; margin: 0;
        }
        .acl-brand-tag {
          margin: 4px 0 0; font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.26em; color: #7fd8a8;
        }
        .acl-divider {
          height: 1px; margin: 0 0 22px;
          background: linear-gradient(90deg, rgba(255,255,255,0.14), transparent);
        }

        .acl-title {
          font-family: 'Fraunces', serif; font-size: 21px; font-weight: 700;
          color: #fff; margin: 0 0 4px;
        }
        .acl-subtitle {
          font-size: 14px; color: #b8bcc4; margin: 0 0 24px;
        }

        /* ---------- Error ---------- */
        .acl-error {
          display: flex; align-items: center; gap: 8px;
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.35);
          border-radius: 12px; padding: 12px 14px; margin-bottom: 20px;
          font-size: 13px; color: #fca5a5;
        }
        .acl-error-icon { flex-shrink: 0; }

        /* ---------- Fields ---------- */
        .acl-field { margin-bottom: 16px; }
        .acl-label {
          display: block; font-size: 12px; font-weight: 600; color: #c4c8d0;
          margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.07em;
        }
        .acl-input-wrap { position: relative; }
        .acl-input-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: #8b90a0; pointer-events: none; transition: color 0.2s ease;
        }
        .acl-input {
          width: 100%; box-sizing: border-box;
          padding: 14px 16px 14px 44px;
          border-radius: 14px;
          background: rgba(8,10,16,0.6);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff; font-size: 15px; font-family: inherit;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .acl-input--pw { padding-right: 48px; }
        .acl-input::placeholder { color: #6b7180; }
        .acl-input:hover { border-color: rgba(255,255,255,0.18); }
        .acl-input:focus-visible,
        .acl-input:focus {
          border-color: rgba(34,197,94,0.7);
          background: rgba(8,10,16,0.82);
          box-shadow: 0 0 0 3px rgba(34,197,94,0.25), 0 0 24px -6px rgba(34,197,94,0.5);
        }
        .acl-input:focus + .acl-toggle { color: #c4c8d0; }
        .acl-input-wrap:focus-within .acl-input-icon { color: #22c55e; }

        /* ---------- Password toggle ---------- */
        .acl-toggle {
          position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; border-radius: 10px;
          cursor: pointer; color: #8b90a0;
          transition: color 0.2s ease, background 0.2s ease;
        }
        .acl-toggle:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .acl-toggle:focus-visible {
          outline: none; color: #fff;
          box-shadow: 0 0 0 2px rgba(34,197,94,0.6);
        }

        /* ---------- Submit ---------- */
        .acl-submit {
          position: relative; overflow: hidden;
          width: 100%; margin-top: 8px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 16px; border: none; border-radius: 14px;
          background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
          color: #fff; font-size: 16px; font-weight: 700; font-family: inherit;
          text-shadow: 0 1px 2px rgba(0,0,0,0.35);
          cursor: pointer;
          box-shadow: 0 12px 34px -8px rgba(34,197,94,0.65), inset 0 1px 0 rgba(255,255,255,0.25);
          transition: box-shadow 0.25s ease, filter 0.2s ease, opacity 0.2s ease;
        }
        .acl-submit:hover:not(:disabled) {
          filter: brightness(1.07);
          box-shadow: 0 18px 44px -8px rgba(34,197,94,0.8), inset 0 1px 0 rgba(255,255,255,0.3);
        }
        .acl-submit:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.45), 0 12px 34px -8px rgba(34,197,94,0.65);
        }
        .acl-submit:disabled { opacity: 0.75; cursor: wait; }
        .acl-input--fehlt, .acl-input--fehlt:hover, .acl-input--fehlt:focus {
          border-color: rgba(248,113,113,0.85);
          box-shadow: 0 0 0 3px rgba(248,113,113,0.18), 0 0 20px -4px rgba(248,113,113,0.5);
          background: rgba(8,10,16,0.82);
        }
        .acl-submit-shine {
          position: absolute; top: 0; left: -120%; width: 60%; height: 100%;
          background: linear-gradient(110deg, transparent, rgba(255,255,255,0.35), transparent);
          transform: skewX(-20deg);
        }
        .acl-submit:hover:not(:disabled) .acl-submit-shine { animation: aclShine 0.9s ease; }

        /* ---------- Footer ---------- */
        .acl-foot {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 12px; color: #9296a2; text-align: center; margin: 20px 0 0;
        }

        .acl-spin { animation: aclSpin 0.8s linear infinite; }

        /* ---------- Responsive: single column on small screens ---------- */
        @media (max-width: 820px) {
          .acl-shell {
            grid-template-columns: 1fr;
            gap: 20px;
            max-width: 440px;
          }
          .acl-spacer { display: none; }
          /* Watermark becomes a centered, subtle texture behind the box */
          .acl-watermark {
            width: 100%;
            padding: 14vw;
          }
          .acl-watermark-img {
            max-width: 420px; max-height: 420px;
            opacity: 0.05;
          }
        }

        /* ---------- Keyframes ---------- */
        @keyframes aclDrift1 {
          0% { transform: translate(0,0) scale(1); }
          100% { transform: translate(8vmax,6vmax) scale(1.15); }
        }
        @keyframes aclDrift2 {
          0% { transform: translate(0,0) scale(1.05); }
          100% { transform: translate(-7vmax,-5vmax) scale(1); }
        }
        @keyframes aclShine { to { left: 130%; } }
        @keyframes aclSpin { to { transform: rotate(360deg); } }

        /* ---------- Respect reduced motion ---------- */
        @media (prefers-reduced-motion: reduce) {
          .acl-aurora-1, .acl-aurora-2,
          .acl-submit-shine, .acl-spin {
            animation: none !important;
          }
          .acl-submit:hover:not(:disabled) .acl-submit-shine { animation: none; }
        }
      `,
        }}
      />
    </div>
  );
}
