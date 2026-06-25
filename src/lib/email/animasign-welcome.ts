/**
 * AnimaSign Welcome Email - Clean version
 * Just hero + success badge + CTA to welcome page.
 * All interactive content lives on the welcome page.
 */

type P = { vorname: string; lang?: "de"|"en"|"es"|"ru"|"tr"; welcomeUrl: string; };

const T: Record<string, Record<string, string>> = {
  de: { subject: "Dein Zugang zur Anima Cura App", thanks: "Vielen Dank", received: "Dein Anamnesebogen ist bei uns eingegangen. Dein pers\u00f6nlicher Zugang ist bereit.", badge: "Account erstellt", ctaTitle: "Alle Details & App-Installation", ctaDesc: "Deine Zugangsdaten, QR-Code, Schritt-f\u00fcr-Schritt Anleitung und Sprachauswahl", cta: "Alle Details ansehen", footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig" },
  en: { subject: "Your Anima Cura App Access", thanks: "Thank you", received: "Your intake form has been received. Your personal access is ready.", badge: "Account created", ctaTitle: "All Details & App Installation", ctaDesc: "Your login credentials, QR code, step-by-step guide and language selection", cta: "View all details", footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig" },
  es: { subject: "Tu acceso a Anima Cura", thanks: "Gracias", received: "Hemos recibido tu formulario. Tu acceso personal est\u00e1 listo.", badge: "Cuenta creada", ctaTitle: "Todos los detalles e instalaci\u00f3n", ctaDesc: "Tus datos de acceso, c\u00f3digo QR, gu\u00eda paso a paso y selecci\u00f3n de idioma", cta: "Ver todos los detalles", footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig" },
  ru: { subject: "\u0422\u0432\u043e\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a Anima Cura", thanks: "\u0421\u043f\u0430\u0441\u0438\u0431\u043e", received: "\u0422\u0432\u043e\u044f \u0430\u043d\u043a\u0435\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430. \u0422\u0432\u043e\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u0433\u043e\u0442\u043e\u0432.", badge: "\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0441\u043e\u0437\u0434\u0430\u043d", ctaTitle: "\u0412\u0441\u0435 \u0434\u0435\u0442\u0430\u043b\u0438", ctaDesc: "\u0414\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430, QR-\u043a\u043e\u0434, \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f", cta: "\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c", footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig" },
  tr: { subject: "Anima Cura Eri\u015fimin", thanks: "Te\u015fekk\u00fcrler", received: "Formun bize ula\u015ft\u0131. Eri\u015fimin haz\u0131r.", badge: "Hesap olu\u015fturuldu", ctaTitle: "T\u00fcm Detaylar", ctaDesc: "Giri\u015f bilgilerin, QR kodu, ad\u0131m ad\u0131m k\u0131lavuz", cta: "Detaylar\u0131 g\u00f6r", footer: "KFO-Praxis Dr. Maria Elena Schubert, Leipzig" },
};

export function buildWelcomeEmail({ vorname, lang = "de", welcomeUrl }: P): { subject: string; html: string } {
  const t = T[lang] || T.de;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
</head><body style="margin:0;padding:0;background:#f5f2ec;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;color:#1d2a27;-webkit-font-smoothing:antialiased;">
<div style="background:radial-gradient(800px 400px at 50% 0%,rgba(35,176,143,0.08),transparent 70%);padding:40px 20px 50px;">
<div style="max-width:520px;margin:0 auto;">
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;"><tr>
    <td style="width:36px;height:36px;border-radius:10px;background:linear-gradient(145deg,#5fd0a8,#0f8a72);text-align:center;vertical-align:middle;font-family:'Fraunces',serif;font-weight:600;font-size:17px;color:#fff;box-shadow:0 8px 22px -8px #0f8a72;">S</td>
    <td style="padding-left:12px;line-height:1.15;"><span style="font-family:'Fraunces',serif;font-weight:600;font-size:15px;">KFO-Praxis Dr. Schubert</span><br><span style="font-size:11px;color:#5f6d67;">Kieferorthop&#228;die &#183; Leipzig</span></td>
  </tr></table>
  <div style="position:relative;background:linear-gradient(180deg,#fdfbf7,#f8f5ef);border:1px solid rgba(29,42,39,0.08);border-radius:20px;overflow:hidden;box-shadow:0 30px 70px -30px rgba(40,55,50,0.25),0 0 0 1px rgba(35,176,143,0.06);">
    <div style="height:3px;background:linear-gradient(90deg,#0f8a72,#5fd0a8,#e6b347,transparent);"></div>
    <div style="text-align:center;padding:44px 32px 32px;">
      <div style="width:80px;height:80px;border-radius:50%;margin:0 auto 22px;background:linear-gradient(145deg,#5fd0a8,#0f8a72);box-shadow:0 14px 34px -12px #0f8a72,0 0 50px rgba(35,176,143,0.3),0 0 80px rgba(35,176,143,0.15);text-align:center;line-height:80px;"><span style="color:#fff;font-size:36px;line-height:80px;">&#10003;</span></div>
      <h1 style="font-family:'Fraunces',serif;font-weight:500;font-size:28px;margin:0 0 10px;">${t.thanks}, ${vorname}!</h1>
      <p style="color:#5f6d67;font-size:14.5px;margin:0 0 22px;line-height:1.7;">${t.received}</p>
      <div style="display:inline-block;background:linear-gradient(150deg,rgba(15,138,114,0.1),rgba(95,208,168,0.05));border:1.5px solid rgba(35,176,143,0.35);border-radius:12px;padding:12px 22px;box-shadow:0 0 24px rgba(35,176,143,0.15),0 0 48px rgba(35,176,143,0.08);">
        <span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:linear-gradient(145deg,#5fd0a8,#0f8a72);text-align:center;line-height:26px;vertical-align:middle;box-shadow:0 0 12px rgba(35,176,143,0.4);"><span style="color:#fff;font-size:13px;">&#10003;</span></span>
        <span style="font-family:'Fraunces',serif;font-size:15px;font-weight:600;color:#0f8a72;vertical-align:middle;margin-left:8px;">${t.badge}</span>
      </div>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(29,42,39,0.08),transparent);margin:0 32px;"></div>
    <div style="padding:32px;">
      <div style="background:linear-gradient(150deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04));border:1.5px solid rgba(35,176,143,0.2);border-radius:16px;padding:28px 24px;text-align:center;box-shadow:0 0 20px rgba(35,176,143,0.08),0 0 40px rgba(35,176,143,0.04);">
        <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;margin-bottom:8px;">${t.ctaTitle}</div>
        <div style="font-size:13.5px;color:#5f6d67;margin-bottom:20px;line-height:1.6;">${t.ctaDesc}</div>
        <a href="${welcomeUrl}" target="_blank" style="display:inline-block;text-decoration:none;background:linear-gradient(145deg,#23b08f,#0f8a72);color:#fff;font-family:'Hanken Grotesk',Helvetica,sans-serif;font-size:15px;font-weight:700;border-radius:14px;padding:15px 40px;box-shadow:0 14px 34px -10px rgba(15,138,114,0.45);">${t.cta} &#8594;</a>
      </div>
    </div>
    <div style="height:2px;background:linear-gradient(90deg,transparent,rgba(35,176,143,0.12),transparent);"></div>
  </div>
  <div style="text-align:center;margin-top:24px;"><div style="font-size:12px;color:#94a09a;">${t.footer}</div></div>
</div></div></body></html>`;

  return { subject: t.subject, html };
}
