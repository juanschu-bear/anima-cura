/**
 * AnimaSign Welcome Email
 * Generates the Done-Screen as HTML email with inline styles.
 * Supports DE, EN, ES, RU, TR.
 */

type WelcomeEmailParams = {
  vorname: string;
  loginEmail: string;
  password: string;
  lang?: "de" | "en" | "es" | "ru" | "tr";
  appUrl?: string;
};

const T: Record<string, Record<string, string>> = {
  de: {
    subject: "Dein Zugang zur Anima Cura App",
    thanks: "Vielen Dank",
    received: "Dein Anamnesebogen ist bei uns eingegangen.",
    whatsNext: "Was kommt als Nächstes?",
    appExplain: "In deiner persönlichen Anima Cura App findest du bald alles rund um deine Behandlung: Rechnungen, Dokumente, Behandlungsphasen, Ratenzahlungen und Nachrichten von der Praxis.",
    yourAccess: "Deine Zugangsdaten",
    loginLabel: "Login-E-Mail",
    passwordLabel: "Passwort",
    hint: "Merke dir diese Daten oder speichere diese E-Mail. Du kannst dein Passwort später in der App ändern.",
    privacyNote: "Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein dafür, damit du sicher auf deine persönliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unberührt.",
    openApp: "Anima Cura App öffnen",
    scanQr: "Oder scanne diesen QR-Code mit deinem Handy:",
    questions: "Bei Fragen sind wir für dich da.",
    phone: "Telefon: 0341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  en: {
    subject: "Your Anima Cura App Access",
    thanks: "Thank you",
    received: "Your intake form has been received.",
    whatsNext: "What happens next?",
    appExplain: "In your personal Anima Cura App, you will soon find everything about your treatment: invoices, documents, treatment phases, payment plans, and messages from the practice.",
    yourAccess: "Your login credentials",
    loginLabel: "Login email",
    passwordLabel: "Password",
    hint: "Remember these credentials or save this email. You can change your password later in the app.",
    privacyNote: "The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app. Your private email address is not affected.",
    openApp: "Open Anima Cura App",
    scanQr: "Or scan this QR code with your phone:",
    questions: "We are here for you if you have any questions.",
    phone: "Phone: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  es: {
    subject: "Tu acceso a la App Anima Cura",
    thanks: "Muchas gracias",
    received: "Tu formulario ha sido recibido.",
    whatsNext: "¿Qué viene ahora?",
    appExplain: "En tu App personal de Anima Cura pronto encontrarás todo sobre tu tratamiento: facturas, documentos, fases del tratamiento, planes de pago y mensajes de la clínica.",
    yourAccess: "Tus datos de acceso",
    loginLabel: "Correo de acceso",
    passwordLabel: "Contraseña",
    hint: "Recuerda estos datos o guarda este correo. Puedes cambiar tu contraseña más tarde en la app.",
    privacyNote: "El correo @animacura.de es un sistema interno de la clínica. Creamos este acceso exclusivamente para que puedas acceder de forma segura a tu app personal. Tu correo privado no se ve afectado.",
    openApp: "Abrir App Anima Cura",
    scanQr: "O escanea este código QR con tu teléfono:",
    questions: "Estamos aquí para ti si tienes alguna pregunta.",
    phone: "Teléfono: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  ru: {
    subject: "Твой доступ к приложению Anima Cura",
    thanks: "Большое спасибо",
    received: "Твоя анкета получена.",
    whatsNext: "Что дальше?",
    appExplain: "В твоём персональном приложении Anima Cura скоро появится всё о твоём лечении: счета, документы, этапы лечения, планы оплаты и сообщения от клиники.",
    yourAccess: "Твои данные для входа",
    loginLabel: "Email для входа",
    passwordLabel: "Пароль",
    hint: "Запомни эти данные или сохрани это письмо. Пароль можно изменить позже в приложении.",
    privacyNote: "Email @animacura.de — это внутренняя система клиники. Этот доступ создан исключительно для безопасного доступа к твоему приложению. Твой личный email не затрагивается.",
    openApp: "Открыть приложение Anima Cura",
    scanQr: "Или отсканируй этот QR-код телефоном:",
    questions: "Мы здесь для тебя, если есть вопросы.",
    phone: "Телефон: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
  tr: {
    subject: "Anima Cura Uygulamana Erisim",
    thanks: "Cok tesekkürler",
    received: "Anamnez formun bize ulasti.",
    whatsNext: "Simdi ne olacak?",
    appExplain: "Kisisel Anima Cura Uygulamanda yakinda tedavinle ilgili her seyi bulacaksin: faturalar, belgeler, tedavi asamalari, ödeme planlari ve klinikten mesajlar.",
    yourAccess: "Giris bilgilerin",
    loginLabel: "Giris e-postasi",
    passwordLabel: "Sifre",
    hint: "Bu bilgileri hatirla veya bu e-postayi kaydet. Sifreni daha sonra uygulamada degistirebilirsin.",
    privacyNote: "@animacura.de giris e-postasi klinige ait bir ic sistemdir. Bu erisim yalnizca kisisel uygulamana güvenli erisim saglamak icin olusturulmustur.",
    openApp: "Anima Cura Uygulamasini Ac",
    scanQr: "Veya bu QR kodu telefonunla tara:",
    questions: "Sorularin varsa buradayiz.",
    phone: "Telefon: +49 341 246 67 40",
    footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig",
  },
};

export function buildWelcomeEmail({ vorname, loginEmail, password, lang = "de", appUrl = "https://anima-cura.vercel.app" }: WelcomeEmailParams): { subject: string; html: string } {
  const t = T[lang] || T.de;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(appUrl)}&bgcolor=0a0e0c&color=4ade80`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e0c;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f0f0f0;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">

  <!-- Logo + Header -->
  <div style="text-align:center;margin-bottom:28px;">
    <div style="width:52px;height:52px;border-radius:50%;background:#22c55e;display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;margin-bottom:16px;">A</div>
    <h1 style="font-size:26px;font-weight:600;color:#f0f0f0;margin:0 0 6px;">${t.thanks}, ${vorname}!</h1>
    <p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0;">${t.received}</p>
  </div>

  <!-- What's next -->
  <div style="background:rgba(34,197,94,0.06);border:1.5px solid rgba(34,197,94,0.25);border-radius:16px;padding:20px;margin-bottom:24px;">
    <h2 style="font-size:16px;font-weight:700;color:#4ade80;margin:0 0 10px;">${t.whatsNext}</h2>
    <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0;">${t.appExplain}</p>
  </div>

  <!-- Credentials -->
  <div style="background:rgba(20,22,20,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:22px;margin-bottom:14px;">
    <h3 style="font-size:14px;font-weight:700;color:#f0f0f0;margin:0 0 16px;">&#128273; ${t.yourAccess}</h3>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${t.loginLabel}</div>
      <div style="font-size:16px;font-weight:700;color:#4ade80;word-break:break-all;">${loginEmail}</div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${t.passwordLabel}</div>
      <div style="font-size:16px;font-weight:700;color:#fbbf24;font-family:monospace;">${password}</div>
    </div>
    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.6;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">${t.hint}</p>
  </div>

  <!-- Privacy note -->
  <div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.6;margin-bottom:24px;padding:0 4px;">
    &#128274; ${t.privacyNote}
  </div>

  <!-- CTA Button -->
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${appUrl}" target="_blank" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:14px;">${t.openApp} &rarr;</a>
  </div>

  <!-- QR Code -->
  <div style="text-align:center;margin-bottom:28px;">
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:0 0 12px;">${t.scanQr}</p>
    <img src="${qrUrl}" alt="QR Code" width="160" height="160" style="border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
    <p style="font-size:12px;color:rgba(255,255,255,0.3);margin:0 0 4px;">${t.questions}</p>
    <p style="font-size:12px;color:rgba(255,255,255,0.3);margin:0 0 4px;">${t.phone}</p>
    <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:8px 0 0;">${t.footer}</p>
  </div>

</div>
</body></html>`;

  return { subject: t.subject, html };
}
