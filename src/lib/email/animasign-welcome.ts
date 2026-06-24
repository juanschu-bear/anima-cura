/**
 * AnimaSign Welcome Email - v7 Done Screen replica
 * Light theme (beige), matches the Anamnesebogen design exactly.
 * Supports DE, EN, ES, RU, TR.
 */

type WelcomeEmailParams = {
  vorname: string;
  loginEmail: string;
  password: string;
  lang?: "de" | "en" | "es" | "ru" | "tr";
  appUrl?: string;
};

const T: Record<string, Record<string, string | string[]>> = {
  de: {
    subject: "Dein Zugang zur Anima Cura App",
    thanks: "Vielen Dank",
    received: "Dein Anamnesebogen ist bei uns eingegangen. Du erh\u00e4ltst deine signierten Unterlagen per E-Mail. Unsere Praxis hat bereits alles archiviert.",
    next: "Was kommt als N\u00e4chstes?",
    appTitle: "Deine pers\u00f6nliche Anima Cura App",
    appDesc: "Ab jetzt hast du deinen eigenen gesch\u00fctzten Bereich, in dem du alles rund um deine Behandlung findest. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit vom Handy aus erreichbar.",
    features: ["Alle <b>Rechnungen</b> und Zahlungspl\u00e4ne auf einen Blick", "Deine <b>Dokumente</b>: Befunde, R\u00f6ntgenbilder, Behandlungspl\u00e4ne", "\u00dcbersicht \u00fcber deine <b>Behandlungsphasen</b> und den aktuellen Stand", "Deine <b>Ratenzahlungen</b>: Was bezahlt ist, was noch offen ist", "<b>Nachrichten</b> von der Praxis direkt in der App"],
    credTitle: "\ud83d\udd11 Deine Zugangsdaten",
    email: "Login-E-Mail",
    pw: "Passwort",
    sec: "Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein daf\u00fcr, damit du sicher auf deine pers\u00f6nliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unber\u00fchrt.",
    screenshot: "Speichere diese E-Mail oder mach einen Screenshot. Du kannst dein Passwort jederzeit nach dem ersten Login \u00e4ndern.",
    open: "Anima Cura App \u00f6ffnen",
    qrDesc: "F\u00fcllst du den Bogen am Tablet oder Computer aus? Scanne den QR-Code mit deinem Handy.",
    btnDesc: "Schon am Handy? Tippe auf den Button und logge dich mit deinen neuen Daten ein.",
    guideTitle: "So geht\u2019s los!",
    guideIntro: "Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen. Danach \u00f6ffnet sie sich mit einem einzigen Tipp.",
    iosSteps: ["\u00d6ffne die App in <b>Safari</b>", "Tippe auf das <b>Teilen-Symbol</b> unten", "W\u00e4hle <b>\u201eZum Home-Bildschirm\u201c</b>", "Tippe auf <b>\u201eHinzuf\u00fcgen\u201c</b> \ud83c\udf89"],
    andSteps: ["\u00d6ffne die App in <b>Chrome</b>", "Tippe auf die <b>drei Punkte</b> oben rechts", "W\u00e4hle <b>\u201eZum Startbildschirm hinzuf\u00fcgen\u201c</b>", "Best\u00e4tige mit <b>\u201eHinzuf\u00fcgen\u201c</b> \ud83c\udf89"],
    appNote: "\ud83d\udccc Die App ist vorerst auf Deutsch, Englisch und Spanisch verf\u00fcgbar. Weitere Sprachen folgen.",
    questions: "Bei Fragen sind wir f\u00fcr dich da.",
    phone: "Telefon: 0341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  en: {
    subject: "Your Anima Cura App Access",
    thanks: "Thank you",
    received: "Your intake form has been received. You will receive your signed documents by email. Our practice has already archived everything.",
    next: "What happens next?",
    appTitle: "Your personal Anima Cura App",
    appDesc: "From now on you have your own secure space where you can find everything about your treatment. No paper chaos, no lost letters, everything in one place, accessible anytime from your phone.",
    features: ["All <b>invoices</b> and payment plans at a glance", "Your <b>documents</b>: findings, X-rays, treatment plans", "Overview of your <b>treatment phases</b> and current status", "Your <b>installment payments</b>: what has been paid, what is still open", "<b>Messages</b> from the practice directly in the app"],
    credTitle: "\ud83d\udd11 Your login credentials",
    email: "Login email",
    pw: "Password",
    sec: "The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app. Your private email address is not affected.",
    screenshot: "Save this email or take a screenshot. You can change your password anytime after your first login.",
    open: "Open Anima Cura App",
    qrDesc: "Filling out the form on a tablet or computer? Scan the QR code with your phone.",
    btnDesc: "Already on your phone? Tap the button and log in with your new credentials.",
    guideTitle: "Let's get started!",
    guideIntro: "Anima Cura is a web app. You don't need to download anything from the App Store. But you can add it to your home screen like a regular app. Then it opens with a single tap.",
    iosSteps: ["Open the app in <b>Safari</b>", "Tap the <b>Share button</b> at the bottom", "Select <b>'Add to Home Screen'</b>", "Tap <b>'Add'</b> \ud83c\udf89"],
    andSteps: ["Open the app in <b>Chrome</b>", "Tap the <b>three dots</b> in the top right", "Select <b>'Add to Home screen'</b>", "Confirm with <b>'Add'</b> \ud83c\udf89"],
    appNote: "\ud83d\udccc The app is currently available in German, English and Spanish. More languages coming soon.",
    questions: "We are here for you if you have any questions.",
    phone: "Phone: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  es: {
    subject: "Tu acceso a la App Anima Cura",
    thanks: "Gracias",
    received: "Hemos recibido tu formulario. Recibir\u00e1s tus documentos firmados por correo electr\u00f3nico. Nuestra consulta ya tiene todo archivado.",
    next: "\u00bfQu\u00e9 viene ahora?",
    appTitle: "Tu app personal Anima Cura",
    appDesc: "A partir de ahora tienes tu propio espacio seguro donde encontrar\u00e1s todo sobre tu tratamiento. Sin papeles perdidos, sin cartas extraviadas, todo en un solo lugar, accesible en cualquier momento desde tu m\u00f3vil.",
    features: ["Todas tus <b>facturas</b> y planes de pago en un solo lugar", "Tus <b>documentos</b>: diagn\u00f3sticos, radiograf\u00edas, planes de tratamiento", "Vista general de tus <b>fases de tratamiento</b> y estado actual", "Tus <b>pagos a plazos</b>: lo que se ha pagado, lo que queda pendiente", "<b>Mensajes</b> de la consulta directamente en la app"],
    credTitle: "\ud83d\udd11 Tus datos de acceso",
    email: "Correo de acceso",
    pw: "Contrase\u00f1a",
    sec: "El correo @animacura.de es un sistema interno de la cl\u00ednica. Creamos este acceso \u00fanicamente para que puedas acceder de forma segura a tu app personal. Tu correo privado no se ve afectado.",
    screenshot: "Guarda este correo o haz una captura de pantalla. Puedes cambiar tu contrase\u00f1a en cualquier momento despu\u00e9s de iniciar sesi\u00f3n.",
    open: "Abrir App Anima Cura",
    qrDesc: "\u00bfEst\u00e1s rellenando en tablet o computadora? Escanea el c\u00f3digo QR con tu m\u00f3vil.",
    btnDesc: "\u00bfYa en el m\u00f3vil? Pulsa el bot\u00f3n e inicia sesi\u00f3n con tus nuevos datos.",
    guideTitle: "\u00a1Empezamos!",
    guideIntro: "Anima Cura es una web app. No necesitas descargar nada de la App Store. Pero puedes a\u00f1adirla a tu pantalla de inicio como una app normal.",
    iosSteps: ["Abre la app en <b>Safari</b>", "Pulsa el <b>bot\u00f3n de compartir</b>", "Selecciona <b>'A\u00f1adir a pantalla de inicio'</b>", "Pulsa <b>'A\u00f1adir'</b> \ud83c\udf89"],
    andSteps: ["Abre la app en <b>Chrome</b>", "Pulsa los <b>tres puntos</b> arriba a la derecha", "Selecciona <b>'A\u00f1adir a pantalla de inicio'</b>", "Confirma con <b>'A\u00f1adir'</b> \ud83c\udf89"],
    appNote: "\ud83d\udccc La app est\u00e1 disponible en alem\u00e1n, ingl\u00e9s y espa\u00f1ol. M\u00e1s idiomas pr\u00f3ximamente.",
    questions: "Estamos aqu\u00ed para ti.",
    phone: "Tel\u00e9fono: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  ru: {
    subject: "\u0422\u0432\u043e\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a Anima Cura",
    thanks: "\u0421\u043f\u0430\u0441\u0438\u0431\u043e",
    received: "\u0422\u0432\u043e\u044f \u0430\u043d\u043a\u0435\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430.",
    next: "\u0427\u0442\u043e \u0434\u0430\u043b\u044c\u0448\u0435?",
    appTitle: "\u0422\u0432\u043e\u0451 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 Anima Cura",
    appDesc: "\u0422\u0435\u043f\u0435\u0440\u044c \u0443 \u0442\u0435\u0431\u044f \u0435\u0441\u0442\u044c \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0437\u0430\u0449\u0438\u0449\u0451\u043d\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e.",
    features: ["\u0412\u0441\u0435 <b>\u0441\u0447\u0435\u0442\u0430</b> \u0438 \u043f\u043b\u0430\u043d\u044b \u043e\u043f\u043b\u0430\u0442\u044b", "\u0422\u0432\u043e\u0438 <b>\u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b</b>", "\u041e\u0431\u0437\u043e\u0440 <b>\u044d\u0442\u0430\u043f\u043e\u0432 \u043b\u0435\u0447\u0435\u043d\u0438\u044f</b>", "\u0422\u0432\u043e\u0438 <b>\u0440\u0430\u0441\u0441\u0440\u043e\u0447\u043a\u0438</b>", "<b>\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f</b> \u043e\u0442 \u043a\u043b\u0438\u043d\u0438\u043a\u0438"],
    credTitle: "\ud83d\udd11 \u0422\u0432\u043e\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430",
    email: "Email \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430",
    pw: "\u041f\u0430\u0440\u043e\u043b\u044c",
    sec: "Email @animacura.de \u2014 \u044d\u0442\u043e \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u044f\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043a\u043b\u0438\u043d\u0438\u043a\u0438.",
    screenshot: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.",
    open: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c Anima Cura",
    qrDesc: "\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439 QR-\u043a\u043e\u0434 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u043e\u043c.",
    btnDesc: "\u041d\u0430\u0436\u043c\u0438 \u043a\u043d\u043e\u043f\u043a\u0443 \u0438 \u0432\u043e\u0439\u0434\u0438.",
    guideTitle: "\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u043c!",
    guideIntro: "Anima Cura \u2014 \u044d\u0442\u043e \u0432\u0435\u0431-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435.",
    iosSteps: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 <b>Safari</b>", "\u041d\u0430\u0436\u043c\u0438 <b>\u00abПоделиться\u00bb</b>", "\u0412\u044b\u0431\u0435\u0440\u0438 <b>\u00abНа экран Домой\u00bb</b>", "\u041d\u0430\u0436\u043c\u0438 <b>\u00abДобавить\u00bb</b>"],
    andSteps: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 <b>Chrome</b>", "\u041d\u0430\u0436\u043c\u0438 <b>\u0442\u0440\u0438 \u0442\u043e\u0447\u043a\u0438</b>", "\u0412\u044b\u0431\u0435\u0440\u0438 <b>\u00abНа главный экран\u00bb</b>", "<b>\u00abДобавить\u00bb</b>"],
    appNote: "\ud83d\udccc \u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u043d\u0435\u043c\u0435\u0446\u043a\u043e\u043c, \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u0438 \u0438\u0441\u043f\u0430\u043d\u0441\u043a\u043e\u043c.",
    questions: "\u041c\u044b \u0437\u0434\u0435\u0441\u044c \u0434\u043b\u044f \u0442\u0435\u0431\u044f.",
    phone: "+49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  tr: {
    subject: "Anima Cura Eri\u015fimin",
    thanks: "Te\u015fekk\u00fcrler",
    received: "Anamnez formun bize ula\u015ft\u0131.",
    next: "S\u0131rada ne var?",
    appTitle: "Ki\u015fisel Anima Cura Uygulaman",
    appDesc: "Art\u0131k tedavinle ilgili her \u015feyi bulabilece\u011fin kendi g\u00fcvenli alan\u0131n var.",
    features: ["T\u00fcm <b>faturalar</b> tek bir yerde", "<b>Belgelerin</b>", "<b>Tedavi a\u015famalar\u0131</b>", "<b>Taksit \u00f6demelerin</b>", "<b>Mesajlar</b>"],
    credTitle: "\ud83d\udd11 Giri\u015f bilgilerin",
    email: "Giri\u015f e-postas\u0131",
    pw: "\u015eifre",
    sec: "@animacura.de dahili bir sistemdir.",
    screenshot: "Bu e-postay\u0131 kaydet.",
    open: "Uygulamay\u0131 a\u00e7",
    qrDesc: "QR kodu telefonunla tara.",
    btnDesc: "D\u00fc\u011fmeye dokun ve giri\u015f yap.",
    guideTitle: "Haydi ba\u015flayal\u0131m!",
    guideIntro: "Anima Cura bir web uygulamas\u0131d\u0131r.",
    iosSteps: ["<b>Safari</b>'de a\u00e7", "<b>Payla\u015f</b> d\u00fc\u011fmesine dokun", "<b>'Ana Ekrana Ekle'</b>", "<b>'Ekle'</b>"],
    andSteps: ["<b>Chrome</b>'da a\u00e7", "<b>\u00dc\u00e7 nokta</b>ya dokun", "<b>'Ana ekrana ekle'</b>", "<b>'Ekle'</b>"],
    appNote: "\ud83d\udccc Uygulama Almanca, \u0130ngilizce ve \u0130spanyolca olarak mevcut.",
    questions: "Sorular\u0131n varsa burada\u0131z.",
    phone: "+49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
};

export function buildWelcomeEmail({ vorname, loginEmail, password, lang = "de", appUrl = "https://anima-cura.vercel.app" }: WelcomeEmailParams): { subject: string; html: string } {
  const t = T[lang] || T.de;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl)}&bgcolor=f5f2ec&color=0f8a72&margin=8`;
  const features = (t.features as string[]).map(f => `<tr><td style="padding:0 10px 8px 0;vertical-align:top;width:16px;"><div style="width:8px;height:8px;border-radius:50%;background:#23b08f;margin-top:7px;"></div></td><td style="padding:0 0 8px;font-size:13px;color:#5f6d67;line-height:1.6;">${f}</td></tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:Helvetica,Arial,sans-serif;color:#1d2a27;">
<div style="max-width:620px;margin:0 auto;padding:28px 22px;">

  <!-- Topbar -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr>
    <td style="width:34px;height:34px;border-radius:10px;background:linear-gradient(145deg,#5fd0a8,#0f8a72);text-align:center;vertical-align:middle;font-size:17px;font-weight:700;color:#fff;">A</td>
    <td style="padding-left:11px;"><b style="font-size:15px;">Anima</b> <span style="font-size:15px;font-weight:400;">Cura</span></td>
  </tr></table>

  <!-- Hero -->
  <div style="text-align:center;margin-bottom:20px;">
    <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(145deg,#5fd0a8,#0f8a72);margin:0 auto 16px;text-align:center;line-height:72px;font-size:30px;">&#10003;</div>
    <h1 style="font-size:26px;font-weight:500;margin:0 0 8px;color:#1d2a27;">${String(t.thanks)}, ${vorname}!</h1>
    <p style="font-size:14px;color:#5f6d67;margin:0;max-width:48ch;display:inline-block;">${String(t.received)}</p>
  </div>

  <!-- Glow Box: What's next -->
  <div style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);border:1.5px solid rgba(35,176,143,0.25);border-radius:16px;padding:22px;margin-bottom:20px;box-shadow:0 0 20px rgba(35,176,143,0.08);">
    <h2 style="font-size:15px;font-weight:700;color:#0f8a72;margin:0 0 8px;">${String(t.next)}</h2>
    <h3 style="font-size:18px;font-weight:600;color:#1d2a27;margin:0 0 10px;">${String(t.appTitle)}</h3>
    <p style="font-size:13px;color:#5f6d67;line-height:1.7;margin:0 0 14px;">${String(t.appDesc)}</p>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">${features}</table>
  </div>

  <!-- Credentials -->
  <div style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);border:1px solid rgba(29,42,39,0.1);border-radius:16px;padding:22px;margin-bottom:12px;">
    <h3 style="font-size:14px;font-weight:700;margin:0 0 16px;color:#1d2a27;">${String(t.credTitle)}</h3>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:#94a09a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${String(t.email)}</div>
      <div style="font-size:17px;font-weight:700;color:#0f8a72;word-break:break-all;">${loginEmail}</div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:#94a09a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${String(t.pw)}</div>
      <div style="font-size:17px;font-weight:700;color:#c2922f;font-family:monospace;">${password}</div>
    </div>
    <p style="font-size:12px;color:#5f6d67;line-height:1.6;margin:0;border-top:1px solid rgba(29,42,39,0.08);padding-top:12px;">&#128274; ${String(t.sec)}</p>
    <p style="font-size:12px;color:#94a09a;line-height:1.5;margin:10px 0 0;">${String(t.screenshot)}</p>
  </div>

  <!-- CTA Button -->
  <div style="text-align:center;margin:24px 0;">
    <a href="${appUrl}" target="_blank" style="display:inline-block;padding:15px 44px;background:linear-gradient(145deg,#23b08f,#0f8a72);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:14px;">${String(t.open)} &rarr;</a>
  </div>

  <!-- QR Code -->
  <div style="text-align:center;margin-bottom:24px;">
    <p style="font-size:12px;color:#5f6d67;margin:0 0 12px;">${String(t.qrDesc)}</p>
    <img src="${qrUrl}" alt="QR Code" width="180" height="180" style="border-radius:14px;border:1px solid rgba(29,42,39,0.08);">
  </div>

  <!-- PWA Guide -->
  <div style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);border:1px solid rgba(29,42,39,0.1);border-radius:16px;padding:20px;margin-bottom:20px;">
    <h3 style="font-size:16px;font-weight:700;color:#1d2a27;margin:0 0 6px;">${String(t.guideTitle)}</h3>
    <p style="font-size:13px;color:#5f6d67;line-height:1.6;margin:0 0 16px;">${String(t.guideIntro)}</p>
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:#0f8a72;margin-bottom:8px;">iPhone (Safari)</div>
      <ol style="margin:0;padding-left:18px;font-size:13px;color:#5f6d67;line-height:1.8;">${(t.iosSteps as string[]).map(s => `<li>${s}</li>`).join("")}</ol>
    </div>
    <div>
      <div style="font-size:12px;font-weight:700;color:#0f8a72;margin-bottom:8px;">Android (Chrome)</div>
      <ol style="margin:0;padding-left:18px;font-size:13px;color:#5f6d67;line-height:1.8;">${(t.andSteps as string[]).map(s => `<li>${s}</li>`).join("")}</ol>
    </div>
    <p style="font-size:12px;color:#94a09a;margin:14px 0 0;">${String(t.appNote)}</p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid rgba(29,42,39,0.08);padding-top:18px;">
    <p style="font-size:12px;color:#5f6d67;margin:0 0 4px;">${String(t.questions)}</p>
    <p style="font-size:12px;color:#5f6d67;margin:0 0 4px;">${String(t.phone)}</p>
    <p style="font-size:11px;color:#94a09a;margin:8px 0 0;">${String(t.footer)}</p>
  </div>

</div></body></html>`;

  return { subject: String(t.subject), html };
}
