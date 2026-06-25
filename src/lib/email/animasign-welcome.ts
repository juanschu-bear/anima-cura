/**
 * AnimaSign Welcome Email — v4
 * 1:1 conversion of anamnese-done-preview-v7.html
 * All CSS variables resolved to inline styles.
 * Static snapshot: password visible, guide open, success shown.
 */

type P = { vorname: string; loginEmail: string; password: string; lang?: "de"|"en"|"es"|"ru"|"tr"; };

const T: Record<string, Record<string, string|string[]>> = {
  de:{subject:"Dein Zugang zur Anima Cura App",thanks:"Vielen Dank",received:"Dein Anamnesebogen ist bei uns eingegangen. Du erh\u00e4ltst deine unterschriebenen Unterlagen per E-Mail. Unsere Praxis hat bereits alles vorliegen.",next:"Was kommt als N\u00e4chstes?",appTitle:"Deine pers\u00f6nliche Anima Cura App",appDesc:"Ab sofort steht dir ein eigener, gesch\u00fctzter Bereich zur Verf\u00fcgung. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit abrufbar von deinem Handy aus.",f1:"Alle <b>Rechnungen</b> und Zahlungspl\u00e4ne \u00fcbersichtlich an einem Ort",f2:"Deine <b>Dokumente</b>: Befunde, R\u00f6ntgenbilder, Behandlungspl\u00e4ne",f3:"\u00dcberblick \u00fcber deine <b>Behandlungsphasen</b> und den aktuellen Stand",f4:"Deine <b>Ratenzahlungen</b>: was bezahlt wurde, was noch offen ist",f5:"<b>Nachrichten</b> von der Praxis direkt in der App",cred:"Deine Zugangsdaten",credTitle:"\ud83d\udd11 Deine Login-Daten",email:"Login-E-Mail",pw:"Passwort",sec:"Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein daf\u00fcr, damit du sicher und gesch\u00fctzt auf deine pers\u00f6nliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unber\u00fchrt.",screenshot:"Speichere diese E-Mail oder mach einen Screenshot von diesen Daten. Du kannst das Passwort nach dem ersten Login jederzeit in der App \u00e4ndern.",open:"App \u00f6ffnen",qrTitle:"\ud83d\udcf1 Vom Handy scannen",qrDesc:"Du f\u00fcllst den Bogen gerade am Tablet oder Computer aus? Scanne den QR-Code mit deinem Handy.",qrHint:"\u00d6ffne die Kamera-App und halte sie auf den Code.",btnTitle:"\ud83d\udc46 Direkt \u00f6ffnen",btnDesc:"Du bist bereits am Handy? Tippe auf den Button und logge dich mit deinen neuen Zugangsdaten ein.",btnText:"Anima Cura \u00f6ffnen \u2192",guideTitle:"So geht\u2019s los!",guideSub:"App auf deinem Homescreen installieren, Schritt f\u00fcr Schritt",guideIntro:"Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen. Danach \u00f6ffnet sie sich mit einem einzigen Tipp.",ios:["\u00d6ffne die App in <b>Safari</b> (nicht Chrome oder andere Browser)","Tippe unten auf das <b>Teilen-Symbol</b> (das Quadrat mit dem Pfeil nach oben)","Scrolle nach unten und tippe auf <b>\u201eZum Home-Bildschirm\u201c</b>","Tippe auf <b>\u201eHinzuf\u00fcgen\u201c</b> \ud83c\udf89"],and:["\u00d6ffne die App in <b>Chrome</b>","Tippe auf die <b>drei Punkte</b> oben rechts (\u22ee)","Tippe auf <b>\u201eZum Startbildschirm hinzuf\u00fcgen\u201c</b>","Best\u00e4tige mit <b>\u201eHinzuf\u00fcgen\u201c</b> \ud83c\udf89"],appNote:"\ud83d\udccc Die App ist vorerst auf Deutsch, Englisch und Spanisch verf\u00fcgbar. Weitere Sprachen folgen.",success:"Dein Account ist erstellt!",footer:"Bei Fragen sind wir f\u00fcr dich da."},
  en:{subject:"Your Anima Cura App Access",thanks:"Thank you",received:"Your medical history form has been received. You will receive your signed documents by email. Our practice already has everything on file.",next:"What happens next?",appTitle:"Your personal Anima Cura App",appDesc:"From now on, you have your own secure space where you can find everything about your treatment. No paper clutter, no lost letters, everything in one place, accessible anytime from your phone.",f1:"All your <b>invoices</b> and payment plans in one place",f2:"Your <b>documents</b>: findings, X-rays, treatment plans",f3:"Overview of your <b>treatment phases</b> and current status",f4:"Your <b>installment payments</b>: what has been paid, what is still open",f5:"<b>Messages</b> from the practice directly in the app",cred:"Your login credentials",credTitle:"\ud83d\udd11 Your login details",email:"Login email",pw:"Password",sec:"The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app. Your private email address remains unaffected.",screenshot:"Save this email or take a screenshot. You can change your password anytime after your first login.",open:"Open the app",qrTitle:"\ud83d\udcf1 Scan from your phone",qrDesc:"Filling out the form on a tablet or computer? Scan the QR code with your phone.",qrHint:"Open the Camera app and point it at the code.",btnTitle:"\ud83d\udc46 Open directly",btnDesc:"Already on your phone? Tap the button and log in with your new credentials.",btnText:"Open Anima Cura \u2192",guideTitle:"Let\u2019s get started!",guideSub:"Install the app on your home screen, step by step",guideIntro:"Anima Cura is a web app. You do not need to download anything from the App Store. But you can add it to your home screen just like a regular app. After that, it opens with a single tap.",ios:["Open the app in <b>Safari</b> (not Chrome or other browsers)","Tap the <b>Share button</b> at the bottom (the square with an upward arrow)","Scroll down and tap <b>\"Add to Home Screen\"</b>","Tap <b>\"Add\"</b> \ud83c\udf89"],and:["Open the app in <b>Chrome</b>","Tap the <b>three dots</b> in the top right (\u22ee)","Tap <b>\"Add to Home screen\"</b>","Confirm with <b>\"Add\"</b> \ud83c\udf89"],appNote:"\ud83d\udccc The app is currently available in German, English and Spanish. More languages coming soon.",success:"Your account is ready!",footer:"Questions? We are here for you."},
  es:{subject:"Tu acceso a la App Anima Cura",thanks:"Gracias",received:"Hemos recibido tu formulario. Recibir\u00e1s tus documentos firmados por correo electr\u00f3nico. Nuestra consulta ya tiene todo archivado.",next:"\u00bfQu\u00e9 viene ahora?",appTitle:"Tu app personal Anima Cura",appDesc:"A partir de ahora tienes tu propio espacio seguro donde encontrar\u00e1s todo sobre tu tratamiento. Sin papeles perdidos, sin cartas extraviadas, todo en un solo lugar, accesible en cualquier momento desde tu m\u00f3vil.",f1:"Todas tus <b>facturas</b> y planes de pago en un solo lugar",f2:"Tus <b>documentos</b>: diagn\u00f3sticos, radiograf\u00edas, planes de tratamiento",f3:"Vista general de tus <b>fases de tratamiento</b> y estado actual",f4:"Tus <b>pagos a plazos</b>: lo que se ha pagado, lo que queda pendiente",f5:"<b>Mensajes</b> de la consulta directamente en la app",cred:"Tus datos de acceso",credTitle:"\ud83d\udd11 Tus datos de inicio de sesi\u00f3n",email:"E-mail de acceso",pw:"Contrase\u00f1a",sec:"El correo @animacura.de es un sistema interno de la consulta. Creamos este acceso \u00fanicamente para que puedas acceder de forma segura a tu app personal. Tu correo privado no se ve afectado.",screenshot:"Guarda este correo o haz una captura de pantalla. Puedes cambiar tu contrase\u00f1a despu\u00e9s de iniciar sesi\u00f3n.",open:"Abrir la app",qrTitle:"\ud83d\udcf1 Escanear desde el m\u00f3vil",qrDesc:"\u00bfEst\u00e1s rellenando el formulario en una tablet o un ordenador? Escanea el c\u00f3digo QR con tu m\u00f3vil.",qrHint:"Abre la c\u00e1mara y apunta al c\u00f3digo.",btnTitle:"\ud83d\udc46 Abrir directamente",btnDesc:"\u00bfYa est\u00e1s en el m\u00f3vil? Pulsa el bot\u00f3n e inicia sesi\u00f3n con tus nuevos datos.",btnText:"Abrir Anima Cura \u2192",guideTitle:"\u00a1Empezamos!",guideSub:"Instala la app en tu pantalla de inicio, paso a paso",guideIntro:"Anima Cura es una web app. No necesitas descargar nada de la App Store. Pero puedes a\u00f1adirla a tu pantalla de inicio como una app normal.",ios:["Abre la app en <b>Safari</b> (no Chrome u otros navegadores)","Pulsa el <b>bot\u00f3n de compartir</b> en la parte inferior","Despl\u00e1zate y pulsa <b>\"A\u00f1adir a la pantalla de inicio\"</b>","Pulsa <b>\"A\u00f1adir\"</b> \ud83c\udf89"],and:["Abre la app en <b>Chrome</b>","Pulsa los <b>tres puntos</b> arriba a la derecha (\u22ee)","Pulsa <b>\"A\u00f1adir a pantalla de inicio\"</b>","Confirma con <b>\"A\u00f1adir\"</b> \ud83c\udf89"],appNote:"\ud83d\udccc La app est\u00e1 disponible de momento en alem\u00e1n, ingl\u00e9s y espa\u00f1ol. M\u00e1s idiomas pr\u00f3ximamente.",success:"\u00a1Tu cuenta est\u00e1 lista!",footer:"\u00bfPreguntas? Estamos aqu\u00ed para ti."},
  ru:{subject:"\u0422\u0432\u043e\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a Anima Cura",thanks:"\u0421\u043f\u0430\u0441\u0438\u0431\u043e",received:"\u0422\u0432\u043e\u044f \u0430\u043d\u043a\u0435\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430. \u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u043d\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u043f\u0440\u0438\u0434\u0443\u0442 \u043d\u0430 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u0443\u044e \u043f\u043e\u0447\u0442\u0443.",next:"\u0427\u0442\u043e \u0434\u0430\u043b\u044c\u0448\u0435?",appTitle:"\u0422\u0432\u043e\u0451 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 Anima Cura",appDesc:"\u0422\u0435\u043f\u0435\u0440\u044c \u0443 \u0442\u0435\u0431\u044f \u0435\u0441\u0442\u044c \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0437\u0430\u0449\u0438\u0449\u0451\u043d\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e.",f1:"\u0412\u0441\u0435 <b>\u0441\u0447\u0435\u0442\u0430</b> \u0438 \u043f\u043b\u0430\u0442\u0451\u0436\u043d\u044b\u0435 \u043f\u043b\u0430\u043d\u044b \u0432 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435",f2:"\u0422\u0432\u043e\u0438 <b>\u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b</b>",f3:"\u041e\u0431\u0437\u043e\u0440 <b>\u044d\u0442\u0430\u043f\u043e\u0432 \u043b\u0435\u0447\u0435\u043d\u0438\u044f</b>",f4:"\u0422\u0432\u043e\u0438 <b>\u0440\u0430\u0441\u0441\u0440\u043e\u0447\u043a\u0438</b>",f5:"<b>\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f</b> \u043e\u0442 \u043a\u043b\u0438\u043d\u0438\u043a\u0438",cred:"\u0422\u0432\u043e\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430",credTitle:"\ud83d\udd11 \u0422\u0432\u043e\u0438 \u043b\u043e\u0433\u0438\u043d-\u0434\u0430\u043d\u043d\u044b\u0435",email:"E-mail",pw:"\u041f\u0430\u0440\u043e\u043b\u044c",sec:"@animacura.de \u2014 \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u044f\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043a\u043b\u0438\u043d\u0438\u043a\u0438.",screenshot:"\u0421\u0434\u0435\u043b\u0430\u0439 \u0441\u043a\u0440\u0438\u043d\u0448\u043e\u0442 \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.",open:"\u041e\u0442\u043a\u0440\u044b\u0442\u044c",qrTitle:"\ud83d\udcf1 \u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c",qrDesc:"\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439 QR-\u043a\u043e\u0434.",qrHint:"\u041e\u0442\u043a\u0440\u043e\u0439 \u043a\u0430\u043c\u0435\u0440\u0443.",btnTitle:"\ud83d\udc46 \u041e\u0442\u043a\u0440\u044b\u0442\u044c",btnDesc:"\u0423\u0436\u0435 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435?",btnText:"\u041e\u0442\u043a\u0440\u044b\u0442\u044c Anima Cura \u2192",guideTitle:"\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u043c!",guideSub:"\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 \u043d\u0430 \u0434\u043e\u043c\u0430\u0448\u043d\u0438\u0439 \u044d\u043a\u0440\u0430\u043d",guideIntro:"Anima Cura \u2014 \u044d\u0442\u043e \u0432\u0435\u0431-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435.",ios:["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 <b>Safari</b>","\u041d\u0430\u0436\u043c\u0438 <b>\u00abПоделиться\u00bb</b>","<b>\u00abНа \u044d\u043a\u0440\u0430\u043d \u0414\u043e\u043c\u043e\u0439\u00bb</b>","<b>\u00abДобавить\u00bb</b> \ud83c\udf89"],and:["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 <b>Chrome</b>","<b>\u0422\u0440\u0438 \u0442\u043e\u0447\u043a\u0438</b> \u0432\u0432\u0435\u0440\u0445\u0443","<b>\u00abДобавить \u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u044d\u043a\u0440\u0430\u043d\u00bb</b>","<b>\u00abДобавить\u00bb</b> \ud83c\udf89"],appNote:"\ud83d\udccc \u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u043d\u0435\u043c\u0435\u0446\u043a\u043e\u043c, \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u0438 \u0438\u0441\u043f\u0430\u043d\u0441\u043a\u043e\u043c.",success:"\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0433\u043e\u0442\u043e\u0432!",footer:"\u0412\u043e\u043f\u0440\u043e\u0441\u044b? \u041c\u044b \u0440\u044f\u0434\u043e\u043c."},
  tr:{subject:"Anima Cura Eri\u015fimin",thanks:"Te\u015fekk\u00fcrler",received:"Anamnez formun bize ula\u015ft\u0131.",next:"S\u0131rada ne var?",appTitle:"Anima Cura Uygulaman",appDesc:"Art\u0131k tedavinle ilgili her \u015feyi bulabilece\u011fin kendi g\u00fcvenli alan\u0131n var.",f1:"T\u00fcm <b>faturalar</b> ve \u00f6deme planlar\u0131",f2:"<b>Belgelerin</b>",f3:"<b>Tedavi a\u015famalar\u0131</b>",f4:"<b>Taksit \u00f6demelerin</b>",f5:"<b>Mesajlar</b>",cred:"Giri\u015f bilgilerin",credTitle:"\ud83d\udd11 Giri\u015f bilgilerin",email:"Giri\u015f e-postas\u0131",pw:"\u015eifre",sec:"@animacura.de dahili bir muayenehane sistemidir.",screenshot:"Bu e-postay\u0131 kaydet.",open:"Uygulamay\u0131 a\u00e7",qrTitle:"\ud83d\udcf1 Telefonla tara",qrDesc:"QR kodu telefonunla tara.",qrHint:"Kameray\u0131 a\u00e7.",btnTitle:"\ud83d\udc46 Do\u011frudan a\u00e7",btnDesc:"Zaten telefondaysan?",btnText:"Anima Cura a\u00e7 \u2192",guideTitle:"Haydi ba\u015flayal\u0131m!",guideSub:"Uygulamay\u0131 ana ekran\u0131na kur",guideIntro:"Anima Cura bir web uygulamas\u0131d\u0131r.",ios:["<b>Safari</b> ile a\u00e7","<b>Payla\u015f</b> d\u00fc\u011fmesine dokun","<b>Ana Ekrana Ekle</b>","<b>Ekle</b> \ud83c\udf89"],and:["<b>Chrome</b> ile a\u00e7","<b>\u00dc\u00e7 nokta</b>ya dokun","<b>Ana ekrana ekle</b>","<b>Ekle</b> \ud83c\udf89"],appNote:"\ud83d\udccc Almanca, \u0130ngilizce ve \u0130spanyolca.",success:"Hesab\u0131n haz\u0131r!",footer:"Sorular\u0131n m\u0131 var? Buraday\u0131z."},
};

export function buildWelcomeEmail({vorname,loginEmail,password,lang="de"}:P):{subject:string;html:string}{
  const t=T[lang]||T.de;const s=(k:string)=>String(t[k]||"");
  const url="https://animacura.io/patient/login";
  const qr=`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=fdfbf7&color=1d2a27`;
  const fs=[s("f1"),s("f2"),s("f3"),s("f4"),s("f5")];
  const ios=t.ios as string[];const and=t.and as string[];

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
</head><body style="margin:0;padding:0;background:#f5f2ec;color:#1d2a27;font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;">

<!-- Topbar -->
<div style="max-width:760px;margin:0 auto;padding:24px 22px 0;display:flex;align-items:center;gap:11px;">
  <div style="width:34px;height:34px;border-radius:10px;display:inline-block;background:linear-gradient(145deg,#5fd0a8,#0f8a72);color:#fff;font-family:'Fraunces',serif;font-weight:600;font-size:17px;text-align:center;line-height:34px;box-shadow:0 8px 22px -8px #0f8a72;">S</div>
  <div style="line-height:1.15;"><b style="font-family:'Fraunces',serif;font-weight:600;font-size:15.5px;">KFO-Praxis Dr. Schubert</b><br><span style="font-size:11px;color:#5f6d67;">Kieferorthop\u00e4die</span></div>
</div>

<div style="max-width:760px;margin:0 auto;padding:14px 22px 60px;">

<!-- Progress bar -->
<div style="display:flex;gap:7px;margin:20px 0 14px;">${Array(8).fill('<div style="height:5px;flex:1;border-radius:999px;background:linear-gradient(90deg,#0f8a72,#5fd0a8);"></div>').join("")}</div>

<!-- Card -->
<div style="position:relative;background:linear-gradient(180deg,#fdfbf7,#f8f5ef);border:1px solid rgba(29,42,39,0.10);border-radius:16px;padding:32px 28px;box-shadow:0 26px 60px -34px rgba(40,55,50,0.4);overflow:hidden;">

<!-- Card top gradient -->
<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0f8a72,#5fd0a8,transparent);"></div>

<!-- Ring + Hero -->
<div style="text-align:center;">
  <div style="width:80px;height:80px;border-radius:50%;margin:0 auto 20px;background:linear-gradient(145deg,#5fd0a8,#0f8a72);box-shadow:0 14px 34px -12px #0f8a72,0 0 40px rgba(35,176,143,0.35);text-align:center;line-height:80px;">
    <span style="color:#fff;font-size:36px;line-height:80px;">\u2713</span>
  </div>
  <h2 style="font-family:'Fraunces',serif;font-weight:500;font-size:28px;margin:0 0 10px;">${s("thanks")}, ${vorname}!</h2>
  <p style="color:#5f6d67;font-size:14.5px;max-width:48ch;margin:0 auto;">${s("received")}</p>
</div>

<!-- Success badge -->
<div style="text-align:center;margin:20px 0;">
  <div style="display:inline-flex;align-items:center;gap:10px;background:linear-gradient(150deg,rgba(15,138,114,0.12),rgba(95,208,168,0.06));border:1.5px solid rgba(35,176,143,0.4);border-radius:14px;padding:14px 22px;box-shadow:0 0 30px rgba(35,176,143,0.2),0 0 60px rgba(35,176,143,0.1);">
    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,#5fd0a8,#0f8a72);text-align:center;line-height:32px;box-shadow:0 0 16px rgba(35,176,143,0.4);"><span style="color:#fff;font-size:16px;">\u2713</span></div>
    <span style="font-family:'Fraunces',serif;font-size:17px;font-weight:600;color:#0f8a72;">${s("success")}</span>
  </div>
</div>

<!-- Divider -->
<div style="height:1px;background:rgba(29,42,39,0.10);margin:24px 0;position:relative;text-align:center;"><span style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);padding:0 12px;color:#0f8a72;font-size:14px;position:relative;top:-10px;">\u2726</span></div>

<!-- Next section -->
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#0f8a72;font-weight:600;margin:0 0 16px;">${s("next")}</div>

<!-- Glow box -->
<div style="border-radius:16px;padding:24px;margin-bottom:24px;overflow:hidden;background:linear-gradient(160deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04),transparent);border:1.5px solid rgba(35,176,143,0.25);box-shadow:0 0 20px rgba(35,176,143,0.2),0 0 40px rgba(35,176,143,0.1);text-align:left;">
  <h3 style="font-family:'Fraunces',serif;font-size:20px;font-weight:500;margin:0 0 12px;">${s("appTitle")}</h3>
  <p style="font-size:14px;margin:0 0 8px;">${s("appDesc")}</p>
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
    ${fs.map(f=>`<tr><td style="padding:0 10px 7px 0;vertical-align:top;width:16px;"><div style="width:8px;height:8px;border-radius:50%;background:linear-gradient(145deg,#5fd0a8,#0f8a72);box-shadow:0 0 8px rgba(35,176,143,0.35);margin-top:7px;"></div></td><td style="font-size:13.5px;line-height:1.6;padding-bottom:7px;">${f}</td></tr>`).join("")}
  </table>
</div>

<!-- Divider -->
<div style="height:1px;background:rgba(29,42,39,0.10);margin:24px 0;position:relative;text-align:center;"><span style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);padding:0 12px;color:#0f8a72;font-size:14px;position:relative;top:-10px;">\u2726</span></div>

<!-- Credentials -->
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#0f8a72;font-weight:600;margin:0 0 16px;">${s("cred")}</div>
<div style="background:#ffffff;border:1.5px solid rgba(29,42,39,0.16);border-radius:14px;padding:22px;margin-bottom:20px;text-align:left;">
  <div style="font-size:13px;font-weight:700;color:#0f8a72;margin-bottom:16px;letter-spacing:.04em;text-transform:uppercase;">${s("credTitle")}</div>
  <div style="padding:12px 0;border-bottom:1px solid rgba(29,42,39,0.10);">
    <div style="font-size:12px;color:#5f6d67;font-weight:500;margin-bottom:6px;">${s("email")}</div>
    <div style="font-size:16px;font-weight:700;color:#0f8a72;word-break:break-all;letter-spacing:.02em;">${loginEmail}</div>
  </div>
  <div style="padding:12px 0;">
    <div style="font-size:12px;color:#5f6d67;font-weight:500;margin-bottom:6px;">${s("pw")}</div>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:11px;border:1.5px solid rgba(35,176,143,0.3);background:rgba(35,176,143,0.04);flex-wrap:wrap;justify-content:space-between;">
      <span style="font-size:16px;font-weight:700;color:#c2922f;font-family:monospace;letter-spacing:.02em;">${password}</span>
    </div>
  </div>
  <div style="font-size:12.5px;color:#5f6d67;margin-top:12px;padding:10px 14px;background:rgba(15,138,114,0.10);border-radius:10px;display:flex;gap:8px;align-items:flex-start;"><span>\ud83d\udd12</span><div>${s("sec")}</div></div>
  <div style="font-size:12.5px;color:#5f6d67;margin-top:8px;padding:10px 14px;background:rgba(15,138,114,0.10);border-radius:10px;display:flex;gap:8px;align-items:flex-start;"><span>\ud83d\udcf8</span><div>${s("screenshot")}</div></div>
</div>

<!-- Divider -->
<div style="height:1px;background:rgba(29,42,39,0.10);margin:24px 0;position:relative;text-align:center;"><span style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);padding:0 12px;color:#0f8a72;font-size:14px;position:relative;top:-10px;">\u2726</span></div>

<!-- Open app -->
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#0f8a72;font-weight:600;margin:0 0 16px;">${s("open")}</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;"><tr>
  <td style="width:50%;vertical-align:top;padding-right:10px;">
    <div style="background:#ffffff;border:1px solid rgba(29,42,39,0.16);border-radius:14px;padding:22px;text-align:center;">
      <h4 style="font-family:'Fraunces',serif;font-size:15px;margin:0 0 8px;">${s("qrTitle")}</h4>
      <p style="font-size:13px;color:#5f6d67;margin:0 0 14px;">${s("qrDesc")}</p>
      <img src="${qr}" alt="QR Code" width="160" height="160" style="border-radius:8px;">
      <div style="font-size:11.5px;color:#94a09a;margin-top:10px;">${s("qrHint")}</div>
    </div>
  </td>
  <td style="width:50%;vertical-align:top;padding-left:10px;">
    <div style="background:#ffffff;border:1px solid rgba(29,42,39,0.16);border-radius:14px;padding:22px;text-align:center;">
      <h4 style="font-family:'Fraunces',serif;font-size:15px;margin:0 0 8px;">${s("btnTitle")}</h4>
      <p style="font-size:13px;color:#5f6d67;margin:0 0 14px;">${s("btnDesc")}</p>
      <a href="${url}" target="_blank" style="display:block;text-align:center;text-decoration:none;font-family:'Hanken Grotesk',Helvetica,sans-serif;font-size:14px;font-weight:600;border-radius:12px;padding:14px 24px;background:linear-gradient(150deg,#e6b347,#c2922f);color:#3a2c08;box-shadow:0 12px 30px -10px #c2922f;">${s("btnText")}</a>
    </div>
  </td>
</tr></table>

<!-- Divider -->
<div style="height:1px;background:rgba(29,42,39,0.10);margin:24px 0;position:relative;text-align:center;"><span style="background:linear-gradient(180deg,#fdfbf7,#f8f5ef);padding:0 12px;color:#0f8a72;font-size:14px;position:relative;top:-10px;">\u2726</span></div>

<!-- Guide (shown expanded) -->
<div style="border-radius:16px;padding:22px 24px;margin-bottom:16px;background:linear-gradient(150deg,rgba(15,138,114,0.08),rgba(95,208,168,0.05));border:1.5px solid rgba(35,176,143,0.3);">
  <div style="font-family:'Fraunces',serif;font-size:20px;font-weight:600;margin-bottom:4px;">${s("guideTitle")}</div>
  <div style="font-size:13px;color:#5f6d67;margin-bottom:16px;">${s("guideSub")}</div>
  <p style="font-size:14px;color:#5f6d67;margin:0 0 16px;">${s("guideIntro")}</p>
  <div style="background:#ffffff;border:1px solid rgba(29,42,39,0.10);border-radius:12px;padding:16px 18px;margin-bottom:10px;">
    <h5 style="font-size:14px;font-weight:700;margin:0 0 8px;">\ud83c\udf4e iPhone / iPad (Safari)</h5>
    <ol style="padding-left:20px;font-size:13.5px;margin:0;">${ios.map(i=>`<li style="padding:4px 0;">${i}</li>`).join("")}</ol>
  </div>
  <div style="background:#ffffff;border:1px solid rgba(29,42,39,0.10);border-radius:12px;padding:16px 18px;">
    <h5 style="font-size:14px;font-weight:700;margin:0 0 8px;">\ud83e\udd16 Android (Chrome)</h5>
    <ol style="padding-left:20px;font-size:13.5px;margin:0;">${and.map(i=>`<li style="padding:4px 0;">${i}</li>`).join("")}</ol>
  </div>
</div>

<!-- App note -->
<div style="text-align:center;font-size:12.5px;color:#5f6d67;margin-top:20px;padding:12px;border:1px solid rgba(29,42,39,0.10);border-radius:11px;background:#ffffff;">${s("appNote")}</div>

<!-- Footer -->
<div style="text-align:center;margin-top:24px;font-size:12.5px;color:#5f6d67;">
  <p>${s("footer")}<br><a href="tel:+493412466740" style="color:#23b08f;text-decoration:none;font-weight:600;">\u260e 0341 246 67 40</a> \u00b7 <a href="mailto:info@praxis-schubert.de" style="color:#23b08f;text-decoration:none;font-weight:600;">\u2709 info@praxis-schubert.de</a></p>
</div>

</div><!-- /card -->
</div><!-- /shell -->
</body></html>`;

  return{subject:s("subject"),html};
}
