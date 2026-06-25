"use client";

import { useState } from "react";

type Props = { vorname: string; loginEmail: string; password: string; lang?: string };

const T: Record<string, Record<string, string | string[]>> = {
  de: {
    thanks: "Vielen Dank",
    received: "Dein Anamnesebogen ist bei uns eingegangen. Du erhaeltst deine unterschriebenen Unterlagen per E-Mail. Unsere Praxis hat bereits alles vorliegen.",
    next: "Was kommt als Naechstes?",
    appTitle: "Deine persoenliche Anima Cura App",
    appDesc: "Ab sofort steht dir ein eigener, geschuetzter Bereich zur Verfuegung. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit abrufbar von deinem Handy aus.",
    f1: "Alle Rechnungen und Zahlungsplaene uebersichtlich an einem Ort",
    f2: "Deine Dokumente: Befunde, Roentgenbilder, Behandlungsplaene",
    f3: "Ueberblick ueber deine Behandlungsphasen und den aktuellen Stand",
    f4: "Deine Ratenzahlungen: was bezahlt wurde, was noch offen ist",
    f5: "Nachrichten von der Praxis direkt in der App",
    cred: "Deine Zugangsdaten",
    credTitle: "Deine Login-Daten",
    email: "Login-E-Mail",
    pw: "Passwort",
    pwTap: "Tippen zum Anzeigen",
    pwHide: "Verbergen",
    sec: "Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein dafuer, damit du sicher und geschuetzt auf deine persoenliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unberuehrt.",
    screenshot: "Speichere diese Seite oder mach einen Screenshot von diesen Daten. Du kannst das Passwort nach dem ersten Login jederzeit in der App aendern.",
    open: "App oeffnen",
    qrTitle: "Vom Handy scannen",
    qrDesc: "Du oeffnest diese Seite gerade am Computer? Scanne den QR-Code mit deinem Handy.",
    qrHint: "Oeffne die Kamera-App und halte sie auf den Code.",
    btnTitle: "Direkt oeffnen",
    btnDesc: "Du bist bereits am Handy? Tippe auf den Button und logge dich mit deinen neuen Zugangsdaten ein.",
    btnText: "Anima Cura oeffnen",
    guideTitle: "So gehts los!",
    guideSub: "App auf deinem Homescreen installieren, Schritt fuer Schritt",
    guideIntro: "Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen.",
    ios: ["Oeffne die App in Safari (nicht Chrome oder andere Browser)", "Tippe unten auf das Teilen-Symbol (das Quadrat mit dem Pfeil nach oben)", "Scrolle nach unten und tippe auf Zum Home-Bildschirm", "Tippe auf Hinzufuegen"],
    and: ["Oeffne die App in Chrome", "Tippe auf die drei Punkte oben rechts", "Zum Startbildschirm hinzufuegen", "Bestaetige mit Hinzufuegen"],
    appNote: "Die App ist vorerst auf Deutsch, Englisch und Spanisch verfuegbar. Weitere Sprachen folgen.",
    success: "Dein Account ist erstellt!",
    copy: "Kopieren",
    copied: "Kopiert!",
  },
  en: {
    thanks: "Thank you",
    received: "Your medical history form has been received. You will receive your signed documents by email. Our practice already has everything on file.",
    next: "What happens next?",
    appTitle: "Your personal Anima Cura App",
    appDesc: "From now on, you have your own secure space. No paper clutter, no lost letters, everything in one place, accessible anytime from your phone.",
    f1: "All your invoices and payment plans in one place",
    f2: "Your documents: findings, X-rays, treatment plans",
    f3: "Overview of your treatment phases and current status",
    f4: "Your installment payments: what has been paid, what is still open",
    f5: "Messages from the practice directly in the app",
    cred: "Your login credentials",
    credTitle: "Your login details",
    email: "Login email",
    pw: "Password",
    pwTap: "Tap to reveal",
    pwHide: "Hide",
    sec: "The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app.",
    screenshot: "Save this page or take a screenshot. You can change your password anytime after your first login.",
    open: "Open the app",
    qrTitle: "Scan from your phone",
    qrDesc: "Opening this on a computer? Scan the QR code with your phone.",
    qrHint: "Open the Camera app and point it at the code.",
    btnTitle: "Open directly",
    btnDesc: "Already on your phone? Tap the button and log in with your new credentials.",
    btnText: "Open Anima Cura",
    guideTitle: "Get started!",
    guideSub: "Install the app on your home screen, step by step",
    guideIntro: "Anima Cura is a web app. You do not need to download anything from the App Store. But you can add it to your home screen just like a regular app.",
    ios: ["Open in Safari (not Chrome)", "Tap the Share button at the bottom", "Scroll down and tap Add to Home Screen", "Tap Add"],
    and: ["Open in Chrome", "Tap the three dots in the top right", "Add to Home screen", "Confirm with Add"],
    appNote: "The app is currently available in German, English and Spanish.",
    success: "Your account is ready!",
    copy: "Copy",
    copied: "Copied!",
  },
  es: {
    thanks: "Gracias",
    received: "Hemos recibido tu formulario. Recibiras tus documentos firmados por correo electronico.",
    next: "Que viene ahora?",
    appTitle: "Tu app personal Anima Cura",
    appDesc: "A partir de ahora tienes tu propio espacio seguro.",
    f1: "Todas tus facturas y planes de pago",
    f2: "Tus documentos: diagnosticos, radiografias",
    f3: "Vista general de tus fases de tratamiento",
    f4: "Tus pagos a plazos",
    f5: "Mensajes de la consulta",
    cred: "Tus datos de acceso",
    credTitle: "Tus datos",
    email: "E-mail de acceso",
    pw: "Contrasena",
    pwTap: "Pulsa para ver",
    pwHide: "Ocultar",
    sec: "El correo @animacura.de es un sistema interno de la consulta.",
    screenshot: "Guarda esta pagina o haz una captura de pantalla.",
    open: "Abrir la app",
    qrTitle: "Escanear",
    qrDesc: "Escanea el codigo QR con tu movil.",
    qrHint: "Abre la camara y apunta al codigo.",
    btnTitle: "Abrir",
    btnDesc: "Ya estas en el movil?",
    btnText: "Abrir Anima Cura",
    guideTitle: "Empezamos!",
    guideSub: "Instala la app paso a paso",
    guideIntro: "Anima Cura es una web app. No necesitas descargar nada.",
    ios: ["Abre en Safari", "Pulsa Compartir", "A pantalla de inicio", "Pulsa Agregar"],
    and: ["Abre en Chrome", "Pulsa los tres puntos", "A pantalla de inicio", "Confirma con Agregar"],
    appNote: "Disponible en aleman, ingles y espanol.",
    success: "Tu cuenta esta lista!",
    copy: "Copiar",
    copied: "Copiado!",
  },
};

export default function WelcomeScreen({ vorname, loginEmail, password, lang: initLang = "de" }: Props) {
  const [lang, setLang] = useState(initLang);
  const [pwVisible, setPwVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const t = T[lang] || T.de;
  const s = (k: string) => String(t[k] || "");
  const features = [s("f1"), s("f2"), s("f3"), s("f4"), s("f5")];
  const ios = (t.ios || []) as string[];
  const and = (t.and || []) as string[];
  const appUrl = "https://animacura.io/patient/login";
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(appUrl) + "&bgcolor=fdfbf7&color=1d2a27";

  const doCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const divider = <div style={{ height: 1, background: "rgba(29,42,39,0.10)", margin: "24px 0", position: "relative" as const, textAlign: "center" as const }}><span style={{ background: "linear-gradient(180deg,#fdfbf7,#f8f5ef)", padding: "0 12px", color: "#0f8a72", fontSize: 14, position: "relative" as const, top: -10 }}>*</span></div>;

  return (
    <div style={{ background: "#f5f2ec", minHeight: "100vh", color: "#1d2a27", fontFamily: "'Hanken Grotesk',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 22px 0", display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", color: "#fff", fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 17, boxShadow: "0 8px 22px -8px #0f8a72" }}>S</div>
        <div style={{ lineHeight: 1.15 }}><b style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 15.5 }}>KFO-Praxis Dr. Schubert</b><br /><small style={{ fontSize: 11, color: "#5f6d67" }}>Kieferorthopaedie</small></div>
      </div>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "14px 22px 60px" }}>
        <div style={{ position: "relative", background: "linear-gradient(180deg,#fdfbf7,#f8f5ef)", border: "1px solid rgba(29,42,39,0.10)", borderRadius: 16, padding: "32px 28px", boxShadow: "0 26px 60px -34px rgba(40,55,50,0.4)", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#0f8a72,#5fd0a8,transparent)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px", background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", boxShadow: "0 14px 34px -12px #0f8a72,0 0 40px rgba(35,176,143,0.35)", display: "grid", placeItems: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36 }}><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 500, fontSize: 28, margin: "0 0 10px" }}>{s("thanks")}, {vorname}!</h2>
            <p style={{ color: "#5f6d67", fontSize: 14.5, maxWidth: "48ch", margin: "0 auto" }}>{s("received")}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", margin: "18px 0 8px" }}>
            {([["de", "DE Deutsch"], ["en", "EN English"], ["es", "ES Espanol"]] as const).map(([l, label]) => (
              <button key={l} onClick={() => setLang(l)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 999, border: lang === l ? "1.5px solid #0f8a72" : "1.5px solid rgba(29,42,39,0.16)", background: lang === l ? "linear-gradient(150deg,rgba(15,138,114,0.10),transparent)" : "#fdfbf7", color: lang === l ? "#23b08f" : "#5f6d67", cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          <div style={{ textAlign: "center", margin: "20px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "linear-gradient(150deg,rgba(15,138,114,0.12),rgba(95,208,168,0.06))", border: "1.5px solid rgba(35,176,143,0.4)", borderRadius: 14, padding: "14px 22px", boxShadow: "0 0 30px rgba(35,176,143,0.2)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", display: "grid", placeItems: "center", boxShadow: "0 0 16px rgba(35,176,143,0.4)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600, color: "#0f8a72" }}>{s("success")}</span>
            </div>
          </div>
          {divider}
          <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#0f8a72", fontWeight: 600, margin: "0 0 16px" }}>{s("next")}</div>
          <div style={{ borderRadius: 16, padding: 24, marginBottom: 24, background: "linear-gradient(160deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04),transparent)", border: "1.5px solid rgba(35,176,143,0.25)", boxShadow: "0 0 20px rgba(35,176,143,0.2)", textAlign: "left" }}>
            <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 500, margin: "0 0 12px" }}>{s("appTitle")}</h3>
            <p style={{ fontSize: 14, margin: "0 0 14px" }}>{s("appDesc")}</p>
            {features.map((f, i) => (
              <div key={i} style={{ fontSize: 13.5, padding: "7px 0 7px 20px", position: "relative", lineHeight: 1.6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", boxShadow: "0 0 8px rgba(35,176,143,0.35)", position: "absolute", left: 0, top: 13 }} />
                {f}
              </div>
            ))}
          </div>
          {divider}
          <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#0f8a72", fontWeight: 600, margin: "0 0 16px" }}>{s("cred")}</div>
          <div style={{ background: "#fff", border: "1.5px solid rgba(29,42,39,0.16)", borderRadius: 14, padding: 22, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f8a72", marginBottom: 16, letterSpacing: ".04em", textTransform: "uppercase" }}>{s("credTitle")}</div>
            <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(29,42,39,0.10)" }}>
              <div style={{ fontSize: 12, color: "#5f6d67", fontWeight: 500, marginBottom: 6 }}>{s("email")}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#0f8a72", wordBreak: "break-all" }}>{loginEmail}</span>
                <button onClick={() => doCopy(loginEmail, "email")} style={{ fontFamily: "inherit", fontSize: 11, color: "#0f8a72", fontWeight: 600, background: "rgba(15,138,114,0.08)", border: "1px solid rgba(15,138,114,0.2)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{copied === "email" ? s("copied") : s("copy")}</button>
              </div>
            </div>
            <div style={{ padding: "12px 0" }}>
              <div style={{ fontSize: 12, color: "#5f6d67", fontWeight: 500, marginBottom: 6 }}>{s("pw")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 11, border: "1.5px solid rgba(35,176,143,0.3)", background: "rgba(35,176,143,0.04)", flexWrap: "wrap", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: pwVisible ? "#c2922f" : "#94a09a", fontFamily: "monospace" }}>{pwVisible ? password : "**********"}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setPwVisible(!pwVisible)} style={{ fontSize: 12, color: "#fff", fontWeight: 700, background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", border: "none", borderRadius: 10, padding: "6px 14px", cursor: "pointer", boxShadow: "0 4px 14px -4px #0f8a72" }}>{pwVisible ? s("pwHide") : s("pwTap")}</button>
                  <button onClick={() => doCopy(password, "pw")} style={{ fontFamily: "inherit", fontSize: 11, color: "#0f8a72", fontWeight: 600, background: "rgba(15,138,114,0.08)", border: "1px solid rgba(15,138,114,0.2)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{copied === "pw" ? s("copied") : s("copy")}</button>
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#5f6d67", marginTop: 12, padding: "10px 14px", background: "rgba(15,138,114,0.10)", borderRadius: 10 }}>{s("sec")}</div>
            <div style={{ fontSize: 12.5, color: "#5f6d67", marginTop: 8, padding: "10px 14px", background: "rgba(15,138,114,0.10)", borderRadius: 10 }}>{s("screenshot")}</div>
          </div>
          {divider}
          <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#0f8a72", fontWeight: 600, margin: "0 0 16px" }}>{s("open")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div style={{ background: "#fff", border: "1px solid rgba(29,42,39,0.16)", borderRadius: 14, padding: 22, textAlign: "center" }}>
              <h4 style={{ fontFamily: "'Fraunces',serif", fontSize: 15, margin: "0 0 8px" }}>{s("qrTitle")}</h4>
              <p style={{ fontSize: 13, color: "#5f6d67", margin: "0 0 14px" }}>{s("qrDesc")}</p>
              <img src={qrUrl} alt="QR Code" width={160} height={160} style={{ borderRadius: 8 }} />
              <div style={{ fontSize: 11.5, color: "#94a09a", marginTop: 10 }}>{s("qrHint")}</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid rgba(29,42,39,0.16)", borderRadius: 14, padding: 22, textAlign: "center" }}>
              <h4 style={{ fontFamily: "'Fraunces',serif", fontSize: 15, margin: "0 0 8px" }}>{s("btnTitle")}</h4>
              <p style={{ fontSize: 13, color: "#5f6d67", margin: "0 0 14px" }}>{s("btnDesc")}</p>
              <a href={appUrl} style={{ display: "block", textDecoration: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 600, borderRadius: 12, padding: "14px 24px", background: "linear-gradient(150deg,#e6b347,#c2922f)", color: "#3a2c08", boxShadow: "0 12px 30px -10px #c2922f" }}>{s("btnText")}</a>
            </div>
          </div>
          {divider}
          <div onClick={() => setGuideOpen(!guideOpen)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer", padding: "22px 24px", marginBottom: 16, borderRadius: 16, background: "linear-gradient(150deg,rgba(15,138,114,0.08),rgba(95,208,168,0.05))", border: "1.5px solid rgba(35,176,143,0.3)" }}>
            <div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>{s("guideTitle")}</div>
              <div style={{ fontSize: 13, color: "#5f6d67" }}>{s("guideSub")}</div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(145deg,#5fd0a8,#0f8a72)", display: "grid", placeItems: "center", boxShadow: "0 0 18px rgba(35,176,143,0.35)", flexShrink: 0, transform: guideOpen ? "rotate(180deg)" : "none", transition: "transform .3s" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </div>
          {guideOpen && (
            <div>
              <p style={{ fontSize: 14, color: "#5f6d67", marginBottom: 16 }}>{s("guideIntro")}</p>
              <div style={{ background: "#fff", border: "1px solid rgba(29,42,39,0.10)", borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
                <h5 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>iPhone / iPad (Safari)</h5>
                <ol style={{ paddingLeft: 20, fontSize: 13.5, margin: 0 }}>{ios.map((step, i) => <li key={i} style={{ padding: "4px 0" }}>{step}</li>)}</ol>
              </div>
              <div style={{ background: "#fff", border: "1px solid rgba(29,42,39,0.10)", borderRadius: 12, padding: "16px 18px" }}>
                <h5 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>Android (Chrome)</h5>
                <ol style={{ paddingLeft: 20, fontSize: 13.5, margin: 0 }}>{and.map((step, i) => <li key={i} style={{ padding: "4px 0" }}>{step}</li>)}</ol>
              </div>
            </div>
          )}
          <div style={{ textAlign: "center", fontSize: 12.5, color: "#5f6d67", marginTop: 20, padding: 12, border: "1px solid rgba(29,42,39,0.10)", borderRadius: 11, background: "#fff" }}>{s("appNote")}</div>
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 12.5, color: "#5f6d67" }}>KFO-Praxis Dr. Maria Elena Schubert, Leipzig</div>
        </div>
      </div>
    </div>
  );
}
