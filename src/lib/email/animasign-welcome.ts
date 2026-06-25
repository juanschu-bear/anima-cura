/**
 * AnimaSign Welcome Email — 1:1 replica of the DoneScreen from AnamneseForm.tsx
 * CSS variables resolved to actual values, all styles inline.
 * Supports DE, EN, ES, RU, TR (exact translations from DONE_T).
 */

type WelcomeEmailParams = {
  vorname: string;
  loginEmail: string;
  password: string;
  lang?: "de" | "en" | "es" | "ru" | "tr";
  appUrl?: string;
};

/* Exact translations from DONE_T in AnamneseForm.tsx */
const DONE_T: Record<string, Record<string, string | string[]>> = {
  de: { thanks: "Vielen Dank", received: "Dein Anamnesebogen ist bei uns eingegangen. Du erh\u00e4ltst deine unterschriebenen Unterlagen per E-Mail. Unsere Praxis hat bereits alles vorliegen.",
    next: "Was kommt als N\u00e4chstes?", appTitle: "Deine pers\u00f6nliche Anima Cura App",
    appDesc: "Ab sofort steht dir ein eigener, gesch\u00fctzter Bereich zur Verf\u00fcgung. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit abrufbar von deinem Handy aus.",
    f1: "Alle Rechnungen und Zahlungspl\u00e4ne \u00fcbersichtlich an einem Ort", f2: "Deine Dokumente: Befunde, R\u00f6ntgenbilder, Behandlungspl\u00e4ne",
    f3: "\u00dcberblick \u00fcber deine Behandlungsphasen und den aktuellen Stand", f4: "Deine Ratenzahlungen: was bezahlt wurde, was noch offen ist", f5: "Nachrichten von der Praxis direkt in der App",
    credLabel: "Deine Zugangsdaten", credTitle: "Deine Login-Daten", emailLabel: "Login-E-Mail", pwLabel: "Passwort",
    secNote: "Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein daf\u00fcr, damit du sicher und gesch\u00fctzt auf deine pers\u00f6nliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unber\u00fchrt.",
    screenshot: "Speichere diese E-Mail oder mach einen Screenshot von diesen Daten. Du kannst das Passwort nach dem ersten Login jederzeit in der App \u00e4ndern.",
    openLabel: "App \u00f6ffnen", qrTitle: "Vom Handy scannen", qrDesc: "Du f\u00fcllst den Bogen gerade am Tablet oder Computer aus? Scanne den QR-Code mit deinem Handy.",
    btnTitle: "Direkt \u00f6ffnen", btnDesc: "Du bist bereits am Handy? Tippe auf den Button und logge dich mit deinen neuen Zugangsdaten ein.", btnText: "Anima Cura \u00f6ffnen",
    guideTitle: "So gehts los!", guideIntro: "Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen. Danach \u00f6ffnet sie sich mit einem einzigen Tipp.",
    ios: ["\u00d6ffne die App in Safari (nicht Chrome oder andere Browser)", "Tippe unten auf das Teilen-Symbol (das Quadrat mit dem Pfeil nach oben)", "Scrolle nach unten und tippe auf Zum Home-Bildschirm", "Tippe auf Hinzuf\u00fcgen"],
    and: ["\u00d6ffne die App in Chrome", "Tippe auf die drei Punkte oben rechts", "Zum Startbildschirm hinzuf\u00fcgen", "Best\u00e4tige mit Hinzuf\u00fcgen"],
    appNote: "Die App ist vorerst auf Deutsch, Englisch und Spanisch verf\u00fcgbar. Weitere Sprachen folgen.",
    success: "Dein Account ist erstellt!", footer: "Bei Fragen sind wir f\u00fcr dich da.", subject: "Dein Zugang zur Anima Cura App" },
  en: { thanks: "Thank you", received: "Your medical history form has been received. You will receive your signed documents by email. Our practice already has everything on file.",
    next: "What happens next?", appTitle: "Your personal Anima Cura App",
    appDesc: "From now on, you have your own secure space where you can find everything about your treatment. No paper clutter, no lost letters, everything in one place, accessible anytime from your phone.",
    f1: "All your invoices and payment plans in one place", f2: "Your documents: findings, X-rays, treatment plans",
    f3: "Overview of your treatment phases and current status", f4: "Your installment payments: what has been paid, what is still open", f5: "Messages from the practice directly in the app",
    credLabel: "Your login credentials", credTitle: "Your login details", emailLabel: "Login email", pwLabel: "Password",
    secNote: "The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app. Your private email address remains unaffected.",
    screenshot: "Save this email or take a screenshot of these details. You can change your password anytime after your first login.",
    openLabel: "Open the app", qrTitle: "Scan from your phone", qrDesc: "Filling out the form on a tablet or computer? Scan the QR code with your phone.",
    btnTitle: "Open directly", btnDesc: "Already on your phone? Tap the button and log in with your new credentials.", btnText: "Open Anima Cura",
    guideTitle: "Lets get started!", guideIntro: "Anima Cura is a web app. You do not need to download anything from the App Store. But you can add it to your home screen just like a regular app. After that, it opens with a single tap.",
    ios: ["Open the app in Safari (not Chrome or other browsers)", "Tap the Share button at the bottom (the square with an upward arrow)", "Scroll down and tap Add to Home Screen", "Tap Add"],
    and: ["Open the app in Chrome", "Tap the three dots in the top right", "Add to Home screen", "Confirm with Add"],
    appNote: "The app is currently available in German, English and Spanish. More languages coming soon.",
    success: "Your account is ready!", footer: "Questions? We are here for you.", subject: "Your Anima Cura App Access" },
  es: { thanks: "Gracias", received: "Hemos recibido tu formulario. Recibir\u00e1s tus documentos firmados por correo electr\u00f3nico. Nuestra consulta ya tiene todo archivado.",
    next: "Que viene ahora?", appTitle: "Tu app personal Anima Cura",
    appDesc: "A partir de ahora tienes tu propio espacio seguro donde encontrar\u00e1s todo sobre tu tratamiento. Sin papeles perdidos, sin cartas extraviadas, todo en un solo lugar, accesible en cualquier momento desde tu m\u00f3vil.",
    f1: "Todas tus facturas y planes de pago en un solo lugar", f2: "Tus documentos: diagn\u00f3sticos, radiograf\u00edas, planes de tratamiento",
    f3: "Vista general de tus fases de tratamiento y estado actual", f4: "Tus pagos a plazos: lo que se ha pagado, lo que queda pendiente", f5: "Mensajes de la consulta directamente en la app",
    credLabel: "Tus datos de acceso", credTitle: "Tus datos de inicio de sesi\u00f3n", emailLabel: "E-mail de acceso", pwLabel: "Contrase\u00f1a",
    secNote: "El correo @animacura.de es un sistema interno de la consulta. Creamos este acceso \u00fanicamente para que puedas acceder de forma segura a tu app personal. Tu correo privado no se ve afectado.",
    screenshot: "Guarda este correo o haz una captura de pantalla. Puedes cambiar tu contrase\u00f1a despu\u00e9s de iniciar sesi\u00f3n.",
    openLabel: "Abrir la app", qrTitle: "Escanear desde el m\u00f3vil", qrDesc: "Est\u00e1s rellenando el formulario en una tablet o un ordenador? Escanea el c\u00f3digo QR con tu m\u00f3vil.",
    btnTitle: "Abrir directamente", btnDesc: "Ya est\u00e1s en el m\u00f3vil? Pulsa el bot\u00f3n e inicia sesi\u00f3n con tus nuevos datos.", btnText: "Abrir Anima Cura",
    guideTitle: "Empezamos!", guideIntro: "Anima Cura es una web app. No necesitas descargar nada de la App Store. Pero puedes a\u00f1adirla a tu pantalla de inicio como una app normal.",
    ios: ["Abre la app en Safari (no Chrome u otros navegadores)", "Pulsa el bot\u00f3n de compartir en la parte inferior", "A\u00f1adir a la pantalla de inicio", "Pulsa A\u00f1adir"],
    and: ["Abre la app en Chrome", "Pulsa los tres puntos arriba a la derecha", "A\u00f1adir a pantalla de inicio", "Confirma con A\u00f1adir"],
    appNote: "La app est\u00e1 disponible de momento en alem\u00e1n, ingl\u00e9s y espa\u00f1ol. M\u00e1s idiomas pr\u00f3ximamente.",
    success: "Tu cuenta est\u00e1 lista!", footer: "Preguntas? Estamos aqu\u00ed para ti.", subject: "Tu acceso a la App Anima Cura" },
  ru: { thanks: "\u0421\u043f\u0430\u0441\u0438\u0431\u043e", received: "\u0422\u0432\u043e\u044f \u0430\u043d\u043a\u0435\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430. \u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u043d\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u043f\u0440\u0438\u0434\u0443\u0442 \u043d\u0430 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u0443\u044e \u043f\u043e\u0447\u0442\u0443.",
    next: "\u0427\u0442\u043e \u0434\u0430\u043b\u044c\u0448\u0435?", appTitle: "\u0422\u0432\u043e\u0451 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 Anima Cura", appDesc: "\u0422\u0435\u043f\u0435\u0440\u044c \u0443 \u0442\u0435\u0431\u044f \u0435\u0441\u0442\u044c \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0437\u0430\u0449\u0438\u0449\u0451\u043d\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e.",
    f1: "\u0412\u0441\u0435 \u0441\u0447\u0435\u0442\u0430 \u0438 \u043f\u043b\u0430\u0442\u0451\u0436\u043d\u044b\u0435 \u043f\u043b\u0430\u043d\u044b", f2: "\u0422\u0432\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b", f3: "\u041e\u0431\u0437\u043e\u0440 \u044d\u0442\u0430\u043f\u043e\u0432 \u043b\u0435\u0447\u0435\u043d\u0438\u044f", f4: "\u0422\u0432\u043e\u0438 \u0440\u0430\u0441\u0441\u0440\u043e\u0447\u043a\u0438", f5: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043e\u0442 \u043a\u043b\u0438\u043d\u0438\u043a\u0438",
    credLabel: "\u0422\u0432\u043e\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430", credTitle: "\u0422\u0432\u043e\u0438 \u043b\u043e\u0433\u0438\u043d-\u0434\u0430\u043d\u043d\u044b\u0435", emailLabel: "E-mail", pwLabel: "\u041f\u0430\u0440\u043e\u043b\u044c",
    secNote: "@animacura.de \u2014 \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u044f\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043a\u043b\u0438\u043d\u0438\u043a\u0438.", screenshot: "\u0421\u0434\u0435\u043b\u0430\u0439 \u0441\u043a\u0440\u0438\u043d\u0448\u043e\u0442 \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.",
    openLabel: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c", qrTitle: "\u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c", qrDesc: "\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439 QR-\u043a\u043e\u0434.",
    btnTitle: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c", btnDesc: "\u0423\u0436\u0435 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435?", btnText: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c Anima Cura",
    guideTitle: "\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u043c!", guideIntro: "Anima Cura \u2014 \u044d\u0442\u043e \u0432\u0435\u0431-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435.",
    ios: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 Safari", "\u041d\u0430\u0436\u043c\u0438 \u041f\u043e\u0434\u0435\u043b\u0438\u0442\u044c\u0441\u044f", "\u041d\u0430 \u044d\u043a\u0440\u0430\u043d \u0414\u043e\u043c\u043e\u0439", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c"],
    and: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 Chrome", "\u0422\u0440\u0438 \u0442\u043e\u0447\u043a\u0438 \u0432\u0432\u0435\u0440\u0445\u0443", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u044d\u043a\u0440\u0430\u043d", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c"],
    appNote: "\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u043d\u0435\u043c\u0435\u0446\u043a\u043e\u043c, \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u0438 \u0438\u0441\u043f\u0430\u043d\u0441\u043a\u043e\u043c.",
    success: "\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0433\u043e\u0442\u043e\u0432!", footer: "\u0412\u043e\u043f\u0440\u043e\u0441\u044b? \u041c\u044b \u0440\u044f\u0434\u043e\u043c.", subject: "\u0422\u0432\u043e\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a Anima Cura" },
  tr: { thanks: "Te\u015fekk\u00fcrler", received: "Anamnez formun bize ula\u015ft\u0131. Muayenehanemiz her \u015feyi kay\u0131t alt\u0131na ald\u0131.",
    next: "S\u0131rada ne var?", appTitle: "Anima Cura Uygulaman", appDesc: "Art\u0131k tedavinle ilgili her \u015feyi bulabilece\u011fin kendi g\u00fcvenli alan\u0131n var.",
    f1: "T\u00fcm faturalar ve \u00f6deme planlar\u0131", f2: "Belgelerin", f3: "Tedavi a\u015famalar\u0131", f4: "Taksit \u00f6demelerin", f5: "Mesajlar",
    credLabel: "Giri\u015f bilgilerin", credTitle: "Giri\u015f bilgilerin", emailLabel: "Giri\u015f e-postas\u0131", pwLabel: "\u015eifre",
    secNote: "@animacura.de dahili bir muayenehane sistemidir.", screenshot: "Bu e-postay\u0131 kaydet veya ekran g\u00f6r\u00fcnt\u00fcs\u00fc al.",
    openLabel: "Uygulamay\u0131 a\u00e7", qrTitle: "Telefonla tara", qrDesc: "QR kodu telefonunla tara.",
    btnTitle: "Do\u011frudan a\u00e7", btnDesc: "Zaten telefondaysan?", btnText: "Anima Cura a\u00e7",
    guideTitle: "Haydi ba\u015flayal\u0131m!", guideIntro: "Anima Cura bir web uygulamas\u0131d\u0131r.",
    ios: ["Safari ile a\u00e7", "Payla\u015f d\u00fc\u011fmesine dokun", "Ana Ekrana Ekle", "Ekle"],
    and: ["Chrome ile a\u00e7", "\u00dc\u00e7 noktaya dokun", "Ana ekrana ekle", "Ekle"],
    appNote: "Uygulama \u015fu an Almanca, \u0130ngilizce ve \u0130spanyolca mevcut.",
    success: "Hesab\u0131n haz\u0131r!", footer: "Sorular\u0131n m\u0131 var? Buraday\u0131z.", subject: "Anima Cura Eri\u015fimin" },
};

/* Resolved CSS variables from AAB_CSS */
const C = {
  bg: "#f5f2ec", card: "#fdfbf7", card2: "#f8f5ef", ink: "#1d2a27",
  muted: "#5f6d67", muted2: "#94a09a", primary: "#0f8a72",
  primaryLighter: "#5fd0a8", primaryBright: "#23b08f",
  primarySoft: "rgba(15,138,114,0.08)", green: "#22c55e",
  gold: "#c2922f", goldBright: "#e6b347", goldInk: "#4a3510",
  line: "#e0d8cc", lineStrong: "#c8bfb0", field: "#f0ece4",
};

export function buildWelcomeEmail({ vorname, loginEmail, password, lang = "de", appUrl = "https://anima-cura.vercel.app/patient/login" }: WelcomeEmailParams): { subject: string; html: string } {
  const t = DONE_T[lang] || DONE_T.de;
  const S = (k: string) => String(t[k] || "");
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(appUrl)}&bgcolor=fdfbf7&color=1d2a27`;
  const features = [S("f1"), S("f2"), S("f3"), S("f4"), S("f5")];
  const ios = t.ios as string[];
  const and = t.and as string[];

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;">
<div style="max-width:540px;margin:0 auto;padding:28px 22px;">

  <!-- Ring + Hero -->
  <div style="text-align:center;padding:20px 10px 6px;">
    <div style="width:74px;height:74px;border-radius:50%;margin:0 auto 18px;display:inline-block;background:linear-gradient(145deg,${C.primaryLighter},${C.primary});box-shadow:0 14px 34px -12px ${C.primary};line-height:74px;text-align:center;">
      <span style="color:#fff;font-size:34px;line-height:74px;">&#10003;</span>
    </div>
    <h2 style="font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:25px;margin:0 0 8px;">${S("thanks")}, ${vorname}!</h2>
    <p style="color:${C.muted};font-size:14px;max-width:44ch;margin:0 auto 14px;">${S("received")}</p>

    <!-- Success Badge -->
    <div style="text-align:center;margin:20px 0;">
      <div style="display:inline-block;background:linear-gradient(150deg,rgba(15,138,114,0.12),rgba(95,208,168,0.06));border:1.5px solid rgba(35,176,143,0.4);border-radius:14px;padding:14px 22px;box-shadow:0 0 30px rgba(35,176,143,0.2),0 0 60px rgba(35,176,143,0.1);">
        <span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,${C.primaryLighter},${C.primary});text-align:center;line-height:32px;vertical-align:middle;box-shadow:0 0 16px rgba(35,176,143,0.4);">
          <span style="color:#fff;font-size:16px;">&#10003;</span>
        </span>
        <span style="font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:600;color:${C.primary};vertical-align:middle;margin-left:10px;">${S("success")}</span>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <div style="height:1px;background:${C.line};margin:24px 0;"></div>

  <!-- Section: Next -->
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.primary};font-weight:600;margin:0 0 16px;">${S("next")}</div>

  <!-- Glow Box -->
  <div style="position:relative;border-radius:16px;padding:20px;margin-bottom:24px;overflow:hidden;background:linear-gradient(160deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04),transparent);border:1.5px solid rgba(35,176,143,0.25);box-shadow:0 0 20px rgba(35,176,143,0.2),0 0 40px rgba(35,176,143,0.1);text-align:left;">
    <h3 style="font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:500;margin:0 0 12px;">${S("appTitle")}</h3>
    <p style="font-size:14px;margin:0 0 8px;color:${C.ink};">${S("appDesc")}</p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
      ${features.map(f => `<tr><td style="padding:0 10px 7px 0;vertical-align:top;width:16px;"><div style="width:8px;height:8px;border-radius:50%;background:linear-gradient(145deg,${C.primaryLighter},${C.primary});box-shadow:0 0 8px rgba(35,176,143,0.35);margin-top:7px;"></div></td><td style="font-size:13.5px;line-height:1.6;padding-bottom:7px;">${f}</td></tr>`).join("")}
    </table>
  </div>

  <!-- Divider -->
  <div style="height:1px;background:${C.line};margin:24px 0;"></div>

  <!-- Section: Credentials -->
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.primary};font-weight:600;margin:0 0 16px;">${S("credLabel")}</div>

  <!-- Credentials Card -->
  <div style="background:${C.field};border:1.5px solid ${C.lineStrong};border-radius:14px;padding:16px;margin-bottom:20px;text-align:left;">
    <div style="font-size:13px;font-weight:700;color:${C.primary};margin-bottom:16px;letter-spacing:.04em;text-transform:uppercase;">${S("credTitle")}</div>
    <div style="padding:12px 0;border-bottom:1px solid ${C.line};">
      <div style="font-size:12px;color:${C.muted};font-weight:500;margin-bottom:6px;">${S("emailLabel")}</div>
      <div style="font-size:16px;font-weight:700;color:${C.primary};word-break:break-all;letter-spacing:.02em;">${loginEmail}</div>
    </div>
    <div style="padding:12px 0;">
      <div style="font-size:12px;color:${C.muted};font-weight:500;margin-bottom:6px;">${S("pwLabel")}</div>
      <div style="font-size:16px;font-weight:700;color:${C.gold};font-family:monospace;letter-spacing:.02em;">${password}</div>
    </div>
    <div style="font-size:12.5px;color:${C.muted};margin-top:12px;padding:10px 14px;background:${C.primarySoft};border-radius:10px;">&#128274; ${S("secNote")}</div>
    <div style="font-size:12.5px;color:${C.muted};margin-top:8px;padding:10px 14px;background:${C.primarySoft};border-radius:10px;">&#128248; ${S("screenshot")}</div>
  </div>

  <!-- Divider -->
  <div style="height:1px;background:${C.line};margin:24px 0;"></div>

  <!-- Section: Open -->
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.primary};font-weight:600;margin:0 0 16px;">${S("openLabel")}</div>

  <!-- QR + Button Split -->
  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;"><tr>
    <td style="width:50%;vertical-align:top;padding-right:10px;">
      <div style="background:${C.field};border:1px solid ${C.lineStrong};border-radius:14px;padding:22px;text-align:center;">
        <h4 style="font-family:'Fraunces',Georgia,serif;font-size:15px;margin:0 0 8px;">${S("qrTitle")}</h4>
        <p style="font-size:13px;color:${C.muted};margin:0 0 14px;">${S("qrDesc")}</p>
        <img src="${qrUrl}" alt="QR Code" width="140" height="140" style="border-radius:8px;">
      </div>
    </td>
    <td style="width:50%;vertical-align:top;padding-left:10px;">
      <div style="background:${C.field};border:1px solid ${C.lineStrong};border-radius:14px;padding:22px;text-align:center;">
        <h4 style="font-family:'Fraunces',Georgia,serif;font-size:15px;margin:0 0 8px;">${S("btnTitle")}</h4>
        <p style="font-size:13px;color:${C.muted};margin:0 0 14px;">${S("btnDesc")}</p>
        <a href="${appUrl}" target="_blank" style="display:block;text-align:center;text-decoration:none;background:linear-gradient(150deg,${C.goldBright},${C.gold});color:${C.goldInk};font-family:'Hanken Grotesk',Helvetica,sans-serif;font-size:14px;font-weight:600;border-radius:12px;padding:13px 22px;box-shadow:0 12px 30px -10px ${C.gold};">${S("btnText")}</a>
      </div>
    </td>
  </tr></table>

  <!-- Divider -->
  <div style="height:1px;background:${C.line};margin:24px 0;"></div>

  <!-- PWA Guide -->
  <div style="text-align:left;margin-bottom:20px;">
    <h3 style="font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;margin:0 0 8px;">${S("guideTitle")}</h3>
    <p style="font-size:14px;color:${C.muted};margin:0 0 16px;">${S("guideIntro")}</p>
    <div style="margin-bottom:14px;">
      <h5 style="font-size:13px;font-weight:700;color:${C.primary};margin:0 0 8px;">iPhone / iPad (Safari)</h5>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:${C.ink};line-height:1.8;">${ios.map(s => `<li><b>${s}</b></li>`).join("")}</ol>
    </div>
    <div>
      <h5 style="font-size:13px;font-weight:700;color:${C.primary};margin:0 0 8px;">Android (Chrome)</h5>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:${C.ink};line-height:1.8;">${and.map(s => `<li><b>${s}</b></li>`).join("")}</ol>
    </div>
    <p style="font-size:12px;color:${C.muted2};margin:14px 0 0;">&#128204; ${S("appNote")}</p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid ${C.line};padding-top:18px;">
    <p style="font-size:13px;color:${C.muted};margin:0 0 4px;">${S("footer")}</p>
    <p style="font-size:12px;color:${C.muted2};margin:4px 0 0;">KFO-Praxis Dr. Maria Elena Schubert, Leipzig</p>
    <p style="font-size:12px;color:${C.muted2};margin:4px 0 0;">Telefon: 0341 246 67 40</p>
  </div>

</div></body></html>`;

  return { subject: S("subject") || "Anima Cura", html };
}
