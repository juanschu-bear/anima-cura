"use client";

import { useEffect, useRef, useState } from "react";

type Props = { vorname: string; loginEmail: string; password: string; lang?: string };

const T: Record<string, Record<string, string | string[]>> = {
  de:{thanks:"Vielen Dank",received:"Dein Anamnesebogen ist bei uns eingegangen. Du erhältst deine unterschriebenen Unterlagen per E-Mail. Unsere Praxis hat bereits alles vorliegen.",next:"Was kommt als Nächstes?",appTitle:"Deine persönliche Anima Cura App",appDesc:"Ab sofort steht dir ein eigener, geschützter Bereich zur Verfügung. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit abrufbar von deinem Handy aus.",features:["Alle <b>Rechnungen</b> und Zahlungspläne übersichtlich an einem Ort","Deine <b>Dokumente</b>: Befunde, Röntgenbilder, Behandlungspläne","Überblick über deine <b>Behandlungsphasen</b> und den aktuellen Stand","Deine <b>Ratenzahlungen</b>: was bezahlt wurde, was noch offen ist","<b>Nachrichten</b> von der Praxis direkt in der App"],cred:"Deine Zugangsdaten",credTitle:"🔑 Deine Login-Daten",email:"Login-E-Mail",pw:"Passwort",pwTap:"👆 Tippen zum Anzeigen",pwHide:"Verbergen",sec:"Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein dafür, damit du sicher und geschützt auf deine persönliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unberührt.",screenshot:"Speichere diese Seite oder mach einen Screenshot von diesen Daten. Du kannst das Passwort nach dem ersten Login jederzeit in der App ändern.",open:"App öffnen",qrTitle:"📱 Vom Handy scannen",qrDesc:"Du öffnest diese Seite gerade am Computer? Scanne den QR-Code mit deinem Handy.",qrHint:"Öffne die Kamera-App und halte sie auf den Code.",btnTitle:"👆 Direkt öffnen",btnDesc:"Du bist bereits am Handy? Tippe auf den Button und logge dich mit deinen neuen Zugangsdaten ein.",btnText:"Anima Cura öffnen →",guideTitle:"So geht's los!",guideSub:"App auf deinem Homescreen installieren, Schritt für Schritt",guideIntro:"Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen.",ios:["Öffne die App in <b>Safari</b> (nicht Chrome oder andere Browser)","Tippe unten auf das <b>Teilen-Symbol</b> (das Quadrat mit dem Pfeil nach oben)","Scrolle nach unten und tippe auf <b>„Zum Home-Bildschirm"</b>","Tippe auf <b>„Hinzufügen"</b> 🎉"],and:["Öffne die App in <b>Chrome</b>","Tippe auf die <b>drei Punkte</b> oben rechts (⋮)","Tippe auf <b>„Zum Startbildschirm hinzufügen"</b>","Bestätige mit <b>„Hinzufügen"</b> 🎉"],appNote:"📌 Die App ist vorerst auf Deutsch, Englisch und Spanisch verfügbar. Weitere Sprachen folgen.",success:"Dein Account ist erstellt!"},
  en:{thanks:"Thank you",received:"Your medical history form has been received. You will receive your signed documents by email. Our practice already has everything on file.",next:"What happens next?",appTitle:"Your personal Anima Cura App",appDesc:"From now on, you have your own secure space. No paper clutter, no lost letters, everything in one place, accessible anytime from your phone.",features:["All your <b>invoices</b> and payment plans in one place","Your <b>documents</b>: findings, X-rays, treatment plans","Overview of your <b>treatment phases</b> and current status","Your <b>installment payments</b>: what has been paid, what is still open","<b>Messages</b> from the practice directly in the app"],cred:"Your login credentials",credTitle:"🔑 Your login details",email:"Login email",pw:"Password",pwTap:"👆 Tap to reveal",pwHide:"Hide",sec:"The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app.",screenshot:"Save this page or take a screenshot. You can change your password anytime after your first login.",open:"Open the app",qrTitle:"📱 Scan from your phone",qrDesc:"Opening this on a computer? Scan the QR code with your phone.",qrHint:"Open the Camera app and point it at the code.",btnTitle:"👆 Open directly",btnDesc:"Already on your phone? Tap the button and log in with your new credentials.",btnText:"Open Anima Cura →",guideTitle:"Let&#x27;s get started!",guideSub:"Install the app on your home screen, step by step",guideIntro:"Anima Cura is a web app. You do not need to download anything from the App Store. But you can add it to your home screen just like a regular app.",ios:["Open in <b>Safari</b> (not Chrome)","Tap the <b>Share button</b> at the bottom","Scroll down and tap <b>Add to Home Screen</b>","Tap <b>Add</b> 🎉"],and:["Open in <b>Chrome</b>","Tap the <b>three dots</b> in the top right","Tap <b>Add to Home screen</b>","Confirm with <b>Add</b> 🎉"],appNote:"📌 The app is currently available in German, English and Spanish.",success:"Your account is ready!"},
  es:{thanks:"Gracias",received:"Hemos recibido tu formulario. Recibirás tus documentos firmados por correo electrónico.",next:"¿Qué viene ahora?",appTitle:"Tu app personal Anima Cura",appDesc:"A partir de ahora tienes tu propio espacio seguro.",features:["Todas tus <b>facturas</b> y planes de pago","Tus <b>documentos</b>: diagnósticos, radiografías","Vista general de tus <b>fases de tratamiento</b>","Tus <b>pagos a plazos</b>","<b>Mensajes</b> de la consulta"],cred:"Tus datos de acceso",credTitle:"🔑 Tus datos",email:"E-mail de acceso",pw:"Contraseña",pwTap:"👆 Pulsa para ver",pwHide:"Ocultar",sec:"El correo @animacura.de es un sistema interno de la consulta.",screenshot:"Guarda esta página o haz una captura de pantalla.",open:"Abrir la app",qrTitle:"📱 Escanear",qrDesc:"Escanea el código QR con tu móvil.",qrHint:"Abre la cámara y apunta al código.",btnTitle:"👆 Abrir",btnDesc:"¿Ya estás en el móvil?",btnText:"Abrir Anima Cura →",guideTitle:"¡Empezamos!",guideSub:"Instala la app paso a paso",guideIntro:"Anima Cura es una web app. No necesitas descargar nada.",ios:["Abre en <b>Safari</b>","Pulsa <b>Compartir</b>","<b>Añadir a pantalla de inicio</b>","<b>Añadir</b> 🎉"],and:["Abre en <b>Chrome</b>","Pulsa los <b>tres puntos</b>","<b>Añadir a pantalla de inicio</b>","<b>Añadir</b> 🎉"],appNote:"📌 Disponible en alemán, inglés y español.",success:"¡Tu cuenta está lista!"},
};

export default function WelcomeScreen({ vorname, loginEmail, password, lang: initLang = "de" }: Props) {
  const [lang, setLang] = useState(initLang);
  const [pwVisible, setPwVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState<string|null>(null);
  const t = T[lang] || T.de;
  const s = (k: string) => String(t[k] || "");
  const features = (t.features || []) as string[];
  const ios = (t.ios || []) as string[];
  const and = (t.and || []) as string[];
  const appUrl = "https://animacura.io/patient/login";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(appUrl)}&bgcolor=fdfbf7&color=1d2a27`;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{background:"#f5f2ec",minHeight:"100vh",color:"#1d2a27",fontFamily:"'Hanken Grotesk',sans-serif",backgroundImage:"radial-gradient(1100px 620px at 85% -14%,rgba(35,176,143,0.06),transparent 60%),radial-gradient(900px 520px at -10% 115%,rgba(95,208,168,0.05),transparent 58%)"}}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      {/* Topbar */}
      <div style={{maxWidth:760,margin:"0 auto",padding:"24px 22px 0",display:"flex",alignItems:"center",gap:11}}>
        <div style={{width:34,height:34,borderRadius:10,display:"grid",placeItems:"center",background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",color:"#fff",fontFamily:"'Fraunces',serif",fontWeight:600,fontSize:17,boxShadow:"0 8px 22px -8px #0f8a72"}}>S</div>
        <div style={{lineHeight:1.15}}><b style={{fontFamily:"'Fraunces',serif",fontWeight:600,fontSize:15.5}}>KFO-Praxis Dr. Schubert</b><br/><small style={{fontSize:11,color:"#5f6d67"}}>Kieferorthopädie</small></div>
      </div>
      <div style={{maxWidth:760,margin:"0 auto",padding:"14px 22px 60px"}}>
        {/* Card */}
        <div style={{position:"relative",background:"linear-gradient(180deg,#fdfbf7,#f8f5ef)",border:"1px solid rgba(29,42,39,0.10)",borderRadius:16,padding:"32px 28px",boxShadow:"0 26px 60px -34px rgba(40,55,50,0.4)",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#0f8a72,#5fd0a8,transparent)"}}/>
          {/* Hero */}
          <div style={{textAlign:"center"}}>
            <div style={{width:80,height:80,borderRadius:"50%",margin:"0 auto 20px",background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",boxShadow:"0 14px 34px -12px #0f8a72,0 0 40px rgba(35,176,143,0.35)",display:"grid",placeItems:"center"}}><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{width:36,height:36}}><path d="M20 6L9 17l-5-5"/></svg></div>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:500,fontSize:28,margin:"0 0 10px"}}>{s("thanks")}, {vorname}!</h2>
            <p style={{color:"#5f6d67",fontSize:14.5,maxWidth:"48ch",margin:"0 auto"}}>{s("received")}</p>
          </div>
          {/* Lang bar */}
          <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap",margin:"18px 0 8px"}}>
            {(["de","en","es"] as const).map(l=>(
              <button key={l} onClick={()=>setLang(l)} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"7px 14px",borderRadius:999,border:lang===l?"1.5px solid #0f8a72":"1.5px solid rgba(29,42,39,0.16)",background:lang===l?"linear-gradient(150deg,rgba(15,138,114,0.10),transparent)":"#fdfbf7",color:lang===l?"#23b08f":"#5f6d67",cursor:"pointer"}}>{l==="de"?"🇩🇪 Deutsch":l==="en"?"🇬🇧 English":"🇪🇸 Español"}</button>
            ))}
          </div>
          {/* Success badge */}
          <div style={{textAlign:"center",margin:"20px 0"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:10,background:"linear-gradient(150deg,rgba(15,138,114,0.12),rgba(95,208,168,0.06))",border:"1.5px solid rgba(35,176,143,0.4)",borderRadius:14,padding:"14px 22px",boxShadow:"0 0 30px rgba(35,176,143,0.2),0 0 60px rgba(35,176,143,0.1)"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",display:"grid",placeItems:"center",boxShadow:"0 0 16px rgba(35,176,143,0.4)"}}><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M20 6L9 17l-5-5"/></svg></div>
              <span style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:600,color:"#0f8a72"}}>{s("success")}</span>
            </div>
          </div>
          {/* Divider */}
          <div style={{height:1,background:"rgba(29,42,39,0.10)",margin:"24px 0",position:"relative",textAlign:"center"}}><span style={{background:"linear-gradient(180deg,#fdfbf7,#f8f5ef)",padding:"0 12px",color:"#0f8a72",fontSize:14,position:"relative",top:-10}}>✦</span></div>
          {/* Next */}
          <div style={{fontSize:11,letterSpacing:".18em",textTransform:"uppercase",color:"#0f8a72",fontWeight:600,margin:"0 0 16px"}}>{s("next")}</div>
          {/* Glow box */}
          <div style={{borderRadius:16,padding:24,marginBottom:24,background:"linear-gradient(160deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04),transparent)",border:"1.5px solid rgba(35,176,143,0.25)",boxShadow:"0 0 20px rgba(35,176,143,0.2),0 0 40px rgba(35,176,143,0.1)",textAlign:"left"}}>
            <h3 style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:500,margin:"0 0 12px"}}>{s("appTitle")}</h3>
            <p style={{fontSize:14,margin:"0 0 8px"}}>{s("appDesc")}</p>
            <ul style={{listStyle:"none",padding:0,margin:"14px 0 0"}}>{features.map((f,i)=><li key={i} style={{fontSize:13.5,padding:"7px 0 7px 20px",position:"relative",lineHeight:1.6}}><span style={{width:8,height:8,borderRadius:"50%",background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",boxShadow:"0 0 8px rgba(35,176,143,0.35)",position:"absolute",left:0,top:13}}/><span dangerouslySetInnerHTML={{__html:f}}/></li>)}</ul>
          </div>
          {/* Divider */}
          <div style={{height:1,background:"rgba(29,42,39,0.10)",margin:"24px 0",position:"relative",textAlign:"center"}}><span style={{background:"linear-gradient(180deg,#fdfbf7,#f8f5ef)",padding:"0 12px",color:"#0f8a72",fontSize:14,position:"relative",top:-10}}>✦</span></div>
          {/* Credentials */}
          <div style={{fontSize:11,letterSpacing:".18em",textTransform:"uppercase",color:"#0f8a72",fontWeight:600,margin:"0 0 16px"}}>{s("cred")}</div>
          <div style={{background:"#ffffff",border:"1.5px solid rgba(29,42,39,0.16)",borderRadius:14,padding:22,marginBottom:20,textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#0f8a72",marginBottom:16,letterSpacing:".04em",textTransform:"uppercase"}}>{s("credTitle")}</div>
            <div style={{padding:"12px 0",borderBottom:"1px solid rgba(29,42,39,0.10)"}}>
              <div style={{fontSize:12,color:"#5f6d67",fontWeight:500,marginBottom:6}}>{s("email")}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <span style={{fontSize:16,fontWeight:700,color:"#0f8a72",wordBreak:"break-all",letterSpacing:".02em"}}>{loginEmail}</span>
                <button onClick={()=>copy(loginEmail,"email")} style={{fontFamily:"inherit",fontSize:11,color:"#0f8a72",fontWeight:600,background:"rgba(15,138,114,0.08)",border:"1px solid rgba(15,138,114,0.2)",borderRadius:8,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>{copied==="email"?"✅ Kopiert!":"📋 Kopieren"}</button>
              </div>
            </div>
            <div style={{padding:"12px 0"}}>
              <div style={{fontSize:12,color:"#5f6d67",fontWeight:500,marginBottom:6}}>{s("pw")}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:11,border:"1.5px solid rgba(35,176,143,0.3)",background:"rgba(35,176,143,0.04)",flexWrap:"wrap",justifyContent:"space-between"}}>
                <span style={{fontSize:16,fontWeight:700,color:pwVisible?"#c2922f":"#94a09a",fontFamily:"monospace",letterSpacing:".02em"}}>{pwVisible?password:"••••••••••"}</span>
                <span style={{display:"flex",gap:6}}>
                  <button onClick={()=>setPwVisible(!pwVisible)} style={{fontSize:12,color:"#fff",fontWeight:700,background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",border:"none",borderRadius:10,padding:"6px 14px",cursor:"pointer",boxShadow:"0 4px 14px -4px #0f8a72"}}>{pwVisible?s("pwHide"):s("pwTap")}</button>
                  <button onClick={()=>copy(password,"pw")} style={{fontFamily:"inherit",fontSize:11,color:"#0f8a72",fontWeight:600,background:"rgba(15,138,114,0.08)",border:"1px solid rgba(15,138,114,0.2)",borderRadius:8,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>{copied==="pw"?"✅ Kopiert!":"📋 Kopieren"}</button>
                </span>
              </div>
            </div>
            <div style={{fontSize:12.5,color:"#5f6d67",marginTop:12,padding:"10px 14px",background:"rgba(15,138,114,0.10)",borderRadius:10,display:"flex",gap:8,alignItems:"flex-start"}}><span>🔒</span><div>{s("sec")}</div></div>
            <div style={{fontSize:12.5,color:"#5f6d67",marginTop:8,padding:"10px 14px",background:"rgba(15,138,114,0.10)",borderRadius:10,display:"flex",gap:8,alignItems:"flex-start"}}><span>📸</span><div>{s("screenshot")}</div></div>
          </div>
          {/* Divider */}
          <div style={{height:1,background:"rgba(29,42,39,0.10)",margin:"24px 0",position:"relative",textAlign:"center"}}><span style={{background:"linear-gradient(180deg,#fdfbf7,#f8f5ef)",padding:"0 12px",color:"#0f8a72",fontSize:14,position:"relative",top:-10}}>✦</span></div>
          {/* Open */}
          <div style={{fontSize:11,letterSpacing:".18em",textTransform:"uppercase",color:"#0f8a72",fontWeight:600,margin:"0 0 16px"}}>{s("open")}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
            <div style={{background:"#ffffff",border:"1px solid rgba(29,42,39,0.16)",borderRadius:14,padding:22,textAlign:"center"}}>
              <h4 style={{fontFamily:"'Fraunces',serif",fontSize:15,margin:"0 0 8px"}}>{s("qrTitle")}</h4>
              <p style={{fontSize:13,color:"#5f6d67",margin:"0 0 14px"}}>{s("qrDesc")}</p>
              <img src={qrUrl} alt="QR Code" width={160} height={160} style={{borderRadius:8}}/>
              <div style={{fontSize:11.5,color:"#94a09a",marginTop:10}}>{s("qrHint")}</div>
            </div>
            <div style={{background:"#ffffff",border:"1px solid rgba(29,42,39,0.16)",borderRadius:14,padding:22,textAlign:"center"}}>
              <h4 style={{fontFamily:"'Fraunces',serif",fontSize:15,margin:"0 0 8px"}}>{s("btnTitle")}</h4>
              <p style={{fontSize:13,color:"#5f6d67",margin:"0 0 14px"}}>{s("btnDesc")}</p>
              <a href={appUrl} style={{display:"block",textAlign:"center",textDecoration:"none",fontFamily:"inherit",fontSize:14,fontWeight:600,borderRadius:12,padding:"14px 24px",background:"linear-gradient(150deg,#e6b347,#c2922f)",color:"#3a2c08",boxShadow:"0 12px 30px -10px #c2922f"}}>{s("btnText")}</a>
            </div>
          </div>
          {/* Divider */}
          <div style={{height:1,background:"rgba(29,42,39,0.10)",margin:"24px 0",position:"relative",textAlign:"center"}}><span style={{background:"linear-gradient(180deg,#fdfbf7,#f8f5ef)",padding:"0 12px",color:"#0f8a72",fontSize:14,position:"relative",top:-10}}>✦</span></div>
          {/* Guide */}
          <div onClick={()=>setGuideOpen(!guideOpen)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,cursor:"pointer",padding:"22px 24px",marginBottom:16,borderRadius:16,background:"linear-gradient(150deg,rgba(15,138,114,0.08),rgba(95,208,168,0.05))",border:"1.5px solid rgba(35,176,143,0.3)"}}>
            <div><div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:600}}>{s("guideTitle")}</div><div style={{fontSize:13,color:"#5f6d67"}}>{s("guideSub")}</div></div>
            <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(145deg,#5fd0a8,#0f8a72)",display:"grid",placeItems:"center",boxShadow:"0 0 18px rgba(35,176,143,0.35)",flexShrink:0,transform:guideOpen?"rotate(180deg)":"none",transition:"transform .3s"}}><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M6 9l6 6 6-6"/></svg></div>
          </div>
          {guideOpen && (
            <div>
              <p style={{fontSize:14,color:"#5f6d67",marginBottom:16}}>{s("guideIntro")}</p>
              <div style={{background:"#ffffff",border:"1px solid rgba(29,42,39,0.10)",borderRadius:12,padding:"16px 18px",marginBottom:10}}>
                <h5 style={{fontSize:14,fontWeight:700,margin:"0 0 8px"}}>🍎 iPhone / iPad (Safari)</h5>
                <ol style={{paddingLeft:20,fontSize:13.5,margin:0}}>{ios.map((step,i)=><li key={i} style={{padding:"4px 0"}} dangerouslySetInnerHTML={{__html:step}}/>)}</ol>
              </div>
              <div style={{background:"#ffffff",border:"1px solid rgba(29,42,39,0.10)",borderRadius:12,padding:"16px 18px"}}>
                <h5 style={{fontSize:14,fontWeight:700,margin:"0 0 8px"}}>🤖 Android (Chrome)</h5>
                <ol style={{paddingLeft:20,fontSize:13.5,margin:0}}>{and.map((step,i)=><li key={i} style={{padding:"4px 0"}} dangerouslySetInnerHTML={{__html:step}}/>)}</ol>
              </div>
            </div>
          )}
          <div style={{textAlign:"center",fontSize:12.5,color:"#5f6d67",marginTop:20,padding:12,border:"1px solid rgba(29,42,39,0.10)",borderRadius:11,background:"#ffffff"}}>{s("appNote")}</div>
          <div style={{textAlign:"center",marginTop:24,fontSize:12.5,color:"#5f6d67"}}>KFO-Praxis Dr. Maria Elena Schubert, Leipzig</div>
        </div>
      </div>
    </div>
  );
}
