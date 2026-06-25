"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { pruefeName, pruefeEmail, pruefeTelefon, pruefePlz, pruefeHausnummer, pruefeDatum, pruefeText, type PruefErgebnis } from "@/lib/validation/feldpruefung";

// Anamnesebogen der KFO-Praxis Dr. Schubert, eigene Komponente (Weg B), 1:1 aus Mockup Variante A.
// CSS unter .aab gekapselt, damit es nicht mit dem Rest der App kollidiert.

const AAB_CSS = `.aab[data-theme="light"]{color-scheme:light;
    --bg:#f5f2ec; --bg-tint-1:rgba(35,176,143,0.06); --bg-tint-2:rgba(95,208,168,0.05);
    --fade-1:rgba(35,176,143,0); --fade-2:rgba(95,208,168,0);
    --card:#fdfbf7; --card-2:#f8f5ef;
    --ink:#1d2a27; --muted:#5f6d67; --muted-2:#94a09a;
    --line:rgba(29,42,39,0.10); --line-strong:rgba(29,42,39,0.16);
    --field:#ffffff;
    --primary:#0f8a72; --primary-bright:#23b08f; --primary-lighter:#5fd0a8; --primary-soft:rgba(15,138,114,0.10);
    --green:#3fab73;
    --gold:#c2922f; --gold-bright:#e6b347; --gold-ink:#3a2c08;
    --fehlt:#e5484d; --fehlt-ring:rgba(229,72,77,0.13); --fehlt-glow:rgba(229,72,77,0.16); --fehlt-bg:rgba(229,72,77,0.07); --fehlt-line:rgba(229,72,77,0.25); --fehlt-ink:#b5363a;
    --shadow:0 26px 60px -34px rgba(40,55,50,0.4);}
.aab[data-theme="dark"]{color-scheme:dark;
    --bg:#0f1614; --bg-tint-1:rgba(47,182,163,0.13); --bg-tint-2:rgba(95,208,168,0.08);
    --fade-1:rgba(47,182,163,0); --fade-2:rgba(95,208,168,0);
    --card:#16201d; --card-2:#1a2622;
    --ink:#eef3ef; --muted:#93a39c; --muted-2:#6c7b74;
    --line:rgba(238,243,239,0.10); --line-strong:rgba(238,243,239,0.17);
    --field:rgba(0,0,0,0.22);
    --primary:#2fb6a3; --primary-bright:#49d0bb; --primary-lighter:#6fe0c6; --primary-soft:rgba(47,182,163,0.14);
    --green:#54b07d;
    --gold:#cda23f; --gold-bright:#ecc463; --gold-ink:#2a2008;
    --fehlt:#ff6b6b; --fehlt-ring:rgba(255,107,107,0.16); --fehlt-glow:rgba(255,107,107,0.18); --fehlt-bg:rgba(255,107,107,0.10); --fehlt-line:rgba(255,107,107,0.3); --fehlt-ink:#ff9a9a;
    --shadow:0 26px 60px -30px rgba(0,0,0,0.8);}
.aab{--radius:16px;--maxw:760px;}
.aab *{box-sizing:border-box;}
.aab{margin:0;padding:0;}
.aab{background-color:var(--bg);
    background-image:
      radial-gradient(1100px 620px at 85% -14%, var(--bg-tint-1), var(--fade-1) 60%),
      radial-gradient(900px 520px at -10% 115%, var(--bg-tint-2), var(--fade-2) 58%);
    color:var(--ink);font-family:"Hanken Grotesk",sans-serif;line-height:1.5;
    -webkit-font-smoothing:antialiased;min-height:100vh;transition:background-color .4s ease,color .3s ease;}
.aab{position:relative;z-index:1;}
.aab::before{content:"";position:fixed;inset:0;z-index:-1;background-color:var(--bg);background-image:radial-gradient(1100px 620px at 85% -14%, var(--bg-tint-1), var(--fade-1) 60%),radial-gradient(900px 520px at -10% 115%, var(--bg-tint-2), var(--fade-2) 58%);transition:background-color .4s ease;}
.aab .topbar{max-width:var(--maxw);margin:0 auto;padding:24px 22px 0;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.aab .brand{display:flex;align-items:center;gap:11px;}
.aab .brand .mark{width:34px;height:34px;border-radius:10px;flex:none;display:grid;place-items:center;
    background:linear-gradient(145deg,var(--primary-lighter),var(--primary));color:#fff;
    font-family:"Fraunces",serif;font-weight:600;font-size:17px;box-shadow:0 8px 22px -8px var(--primary);}
.aab .brand .txt{display:flex;flex-direction:column;line-height:1.15;}
.aab .brand .txt b{font-family:"Fraunces",serif;font-weight:600;font-size:15.5px;letter-spacing:.1px;}
.aab .brand .txt small{font-size:11px;color:var(--muted);letter-spacing:.02em;}
.aab .theme-toggle{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--card);
    display:grid;place-items:center;cursor:pointer;color:var(--muted);transition:all .2s ease;}
.aab .theme-toggle:hover{color:var(--ink);border-color:var(--line-strong);}
.aab .theme-toggle svg{width:18px;height:18px;}
.aab[data-theme="light"] .moon{display:block;}
.aab[data-theme="light"] .sun{display:none;}
.aab[data-theme="dark"] .moon{display:none;}
.aab[data-theme="dark"] .sun{display:block;}
.aab .shell{max-width:var(--maxw);margin:0 auto;padding:14px 22px 130px;}
.aab .lead{margin:20px 0 22px;}
.aab .lead .eyebrow{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--primary);font-weight:600;margin:0 0 8px;}
.aab .lead h1{font-family:"Fraunces",serif;font-weight:500;font-size:33px;line-height:1.05;margin:0 0 10px;letter-spacing:-.5px;}
.aab .lead p{margin:0;color:var(--muted);font-size:14.5px;max-width:54ch;}
.aab .progress{display:flex;gap:7px;margin:0 0 22px;}
.aab .progress .seg{height:5px;flex:1;border-radius:999px;background:var(--line);overflow:hidden;position:relative;transition:opacity .3s;}
.aab .progress .seg.done::after, .aab .progress .seg.active::after{content:"";position:absolute;inset:0;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--primary-lighter));}
.aab .progress .seg.active::after{width:55%;}
.aab .step-meta{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 16px;}
.aab .step-meta .kicker{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--primary);font-weight:600;}
.aab .step-meta .count{font-size:12.5px;color:var(--muted-2);}
.aab .card{position:relative;background:linear-gradient(180deg,var(--card),var(--card-2));border:1px solid var(--line);border-radius:var(--radius);padding:28px 26px;box-shadow:var(--shadow);overflow:hidden;}
.aab .card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--primary),var(--primary-lighter),transparent);}
.aab .card h2{font-family:"Fraunces",serif;font-weight:500;font-size:22px;margin:0 0 5px;letter-spacing:-.2px;}
.aab .card .sub{color:var(--muted);font-size:13.5px;margin:0 0 22px;max-width:52ch;}
.aab .step{display:none;animation:rise .45s cubic-bezier(.2,.7,.2,1);}
.aab .step.active{display:block;}
@keyframes rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.aab .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;}
.aab .field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px;}
.aab .field.col-2{grid-column:span 2;}
@media(max-width:560px){.aab .grid{grid-template-columns:1fr;}.aab .field.col-2{grid-column:span 1;}}
.aab label{font-size:13px;color:var(--ink);font-weight:600;display:flex;align-items:center;gap:8px;}
.aab .req{color:var(--primary);font-size:14px;line-height:1;}
.aab .opt{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted-2);border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-weight:600;}
.aab .hint{font-size:12px;color:var(--muted);margin-top:-1px;}
.aab input[type=text], .aab input[type=email], .aab input[type=tel], .aab input[type=date], .aab textarea, .aab select{width:100%;background:var(--field);border:1px solid var(--line-strong);border-radius:11px;
    padding:12px 13px;color:var(--ink);font-family:inherit;font-size:14px;transition:border-color .18s,box-shadow .18s;}
.aab textarea{resize:vertical;min-height:80px;}
.aab input:focus, .aab textarea:focus, .aab select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft);}
.aab input::placeholder, .aab textarea::placeholder{color:var(--muted-2);}
.aab select{appearance:none;}
.aab .yn{display:flex;gap:8px;}
.aab .yn button{flex:1;background:var(--field);border:1px solid var(--line-strong);color:var(--muted);border-radius:11px;padding:11px;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .16s;}
.aab .yn button:hover{border-color:var(--primary);color:var(--ink);}
.aab .yn button.on{background:linear-gradient(150deg,var(--primary-soft),transparent);border-color:var(--primary);color:var(--primary-bright);}
.aab .qrow{padding:16px 0;border-bottom:1px solid var(--line);}
.aab .qrow:last-child{border-bottom:none;}
.aab .qrow .qtext{font-size:14px;margin:0 0 11px;display:flex;gap:9px;align-items:flex-start;}
.aab .qrow .qtext .req{margin-top:1px;}
.aab .followup{margin-top:12px;display:none;}
.aab .followup.show{display:block;animation:rise .35s ease;}
.aab .pills{display:flex;flex-wrap:wrap;gap:8px;}
.aab .pills button{background:var(--field);border:1px solid var(--line-strong);color:var(--muted);border-radius:999px;padding:9px 15px;font-family:inherit;font-size:13px;cursor:pointer;transition:all .16s;}
.aab .pills button:hover{border-color:var(--primary);color:var(--ink);}
.aab .pills button.on{background:linear-gradient(150deg,var(--primary-soft),transparent);border-color:var(--primary);color:var(--primary-bright);font-weight:600;}
.aab .callout{display:flex;gap:11px;align-items:flex-start;background:linear-gradient(150deg,var(--primary-soft),transparent);border:1px solid var(--line);border-radius:13px;padding:13px 15px;font-size:13px;color:var(--ink);margin-bottom:20px;}
.aab .callout svg{width:18px;height:18px;color:var(--primary);flex:none;margin-top:1px;}
.aab .consent{display:flex;gap:13px;padding:15px;border:1px solid var(--line);border-radius:13px;background:var(--field);margin-bottom:11px;cursor:pointer;transition:border-color .16s;}
.aab .consent:hover{border-color:var(--line-strong);}
.aab .consent .box{width:22px;height:22px;border-radius:7px;border:1.5px solid var(--line-strong);flex:none;display:grid;place-items:center;margin-top:1px;transition:all .16s;}
.aab .consent.on .box{background:linear-gradient(145deg,var(--primary-lighter),var(--green));border-color:var(--green);}
.aab .consent .box svg{width:13px;height:13px;opacity:0;transition:opacity .16s;}
.aab .consent.on .box svg{opacity:1;}
.aab .consent .ct{font-size:13px;color:var(--ink);}
.aab .consent .chint{font-size:12px;color:var(--primary-bright);margin-top:6px;display:flex;gap:6px;align-items:flex-start;}
.aab .consent .chint svg{width:14px;height:14px;flex:none;margin-top:1px;}
.aab .consent .meta{margin-top:8px;}
.aab .tag{font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-weight:600;}
.aab .tag.pflicht{color:var(--primary);border-color:var(--primary-soft);}
.aab .tag.frei{color:var(--muted-2);}
.aab .sigpad{width:100%;height:180px;border:1.5px dashed var(--line-strong);border-radius:13px;background:var(--field);touch-action:none;cursor:crosshair;display:block;}
.aab .sigbar{display:flex;justify-content:space-between;align-items:center;margin-top:9px;}
.aab .linkbtn{background:none;border:none;color:var(--primary-bright);font-family:inherit;font-size:12.5px;cursor:pointer;text-decoration:underline;}
.aab .done-screen{display:none;text-align:center;padding:20px 10px 6px;animation:rise .5s ease;}
.aab .done-screen.show{display:block;}
.aab .done-screen .ring{width:74px;height:74px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;background:linear-gradient(145deg,var(--primary-lighter),var(--primary));box-shadow:0 14px 34px -12px var(--primary);}
.aab .done-screen .ring svg{width:34px;height:34px;color:#fff;}
.aab .done-screen h2{font-family:"Fraunces",serif;font-weight:500;font-size:25px;margin:0 0 8px;}
.aab .done-screen p{color:var(--muted);font-size:14px;max-width:44ch;margin:0 auto 14px;}
.aab .done-screen .applink{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--primary-bright);background:var(--primary-soft);border:1px solid var(--line);border-radius:999px;padding:9px 16px;}
.aab .nav{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(180deg,transparent,var(--bg) 40%);padding:28px 22px 22px;}
.aab .nav .inner{max-width:var(--maxw);margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:space-between;}
.aab .btn{font-family:inherit;font-size:14px;font-weight:600;border-radius:12px;padding:13px 22px;cursor:pointer;border:1px solid var(--line-strong);background:var(--card);color:var(--ink);transition:all .16s;}
.aab .btn:hover{border-color:var(--line-strong);}
.aab .btn.primary{background:linear-gradient(150deg,var(--gold-bright),var(--gold));border:none;color:var(--gold-ink);box-shadow:0 12px 30px -10px var(--gold);}
.aab .btn.primary:hover{filter:brightness(1.05);}
.aab .btn:disabled{opacity:.35;cursor:not-allowed;}
.aab .plabel{font-size:12.5px;color:var(--muted);}
.aab input.fehlt, .aab select.fehlt, .aab textarea.fehlt{border-color:var(--fehlt);box-shadow:0 0 0 3px var(--fehlt-ring),0 0 16px var(--fehlt-glow);}
.aab .yn.fehlt, .aab .pills.fehlt{padding:8px;border-radius:13px;border:1.5px solid var(--fehlt);box-shadow:0 0 16px var(--fehlt-glow);}
.aab .consent.fehlt{border-color:var(--fehlt);box-shadow:0 0 0 1px var(--fehlt-ring),0 0 16px var(--fehlt-glow);}
.aab .sigpad.fehlt{border-color:var(--fehlt);box-shadow:0 0 16px var(--fehlt-glow);}
.aab .fehlt-hinweis{display:flex;align-items:center;gap:9px;background:var(--fehlt-bg);border:1px solid var(--fehlt-line);color:var(--fehlt-ink);border-radius:11px;padding:11px 14px;font-size:13px;font-weight:500;margin-bottom:18px;}
.aab .fehlt-hinweis .pkt{width:9px;height:9px;border-radius:50%;background:var(--fehlt);flex:none;box-shadow:0 0 9px var(--fehlt-glow);}
.aab .fehlt-grund{display:block;font-size:11.5px;color:var(--fehlt-ink);margin-top:5px;font-weight:500;}
.aab .done-lang-bar{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:18px 0 8px;}
.aab .done-lang-btn{font-family:inherit;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;border:1.5px solid var(--line-strong);background:var(--card);color:var(--muted);cursor:pointer;transition:all .16s;}
.aab .done-lang-btn:hover{border-color:var(--primary);color:var(--ink);}
.aab .done-lang-btn.on{background:linear-gradient(150deg,var(--primary-soft),transparent);border-color:var(--primary);color:var(--primary-bright);}
.aab .shimmer-bar{height:4px;border-radius:999px;overflow:hidden;margin:24px 0 12px;background:var(--line);}
.aab .shimmer-track{height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--primary-lighter),var(--gold-bright),var(--primary-bright),var(--primary));background-size:300% 100%;animation:aabShimmer 2s ease-in-out infinite;}
@keyframes aabShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
.aab .shimmer-text{text-align:center;font-size:13px;color:var(--muted);animation:aabPulse 2s ease-in-out infinite;}
@keyframes aabPulse{0%,100%{opacity:.5}50%{opacity:1}}
.aab .account-reveal{animation:aabSlide .6s cubic-bezier(.2,.7,.2,1);}
@keyframes aabSlide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.aab .success-flash{text-align:center;margin:20px 0;}
.aab .success-badge{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(150deg,rgba(15,138,114,0.12),rgba(95,208,168,0.06));border:1.5px solid rgba(35,176,143,0.4);border-radius:14px;padding:14px 22px;box-shadow:0 0 30px rgba(35,176,143,0.2),0 0 60px rgba(35,176,143,0.1);}
.aab .success-badge .schk{width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,var(--primary-lighter),var(--primary));display:grid;place-items:center;box-shadow:0 0 16px rgba(35,176,143,0.4);}
.aab .success-badge .schk svg{width:16px;height:16px;color:#fff;}
.aab .success-badge span{font-family:"Fraunces",serif;font-size:17px;font-weight:600;color:var(--primary);}
.aab .done-divider{height:1px;background:var(--line);margin:24px 0;}
.aab .done-slabel{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--primary);font-weight:600;margin:0 0 16px;}
.aab .glow-box{position:relative;border-radius:16px;padding:20px;margin-bottom:24px;overflow:hidden;background:linear-gradient(160deg,rgba(15,138,114,0.08),rgba(95,208,168,0.04),transparent);border:1.5px solid rgba(35,176,143,0.25);box-shadow:0 0 20px rgba(35,176,143,0.2),0 0 40px rgba(35,176,143,0.1);animation:aabGlow 3s ease-in-out infinite alternate;}
@keyframes aabGlow{from{border-color:rgba(35,176,143,0.25);box-shadow:0 0 20px rgba(35,176,143,0.15)}to{border-color:rgba(35,176,143,0.5);box-shadow:0 0 28px rgba(35,176,143,0.3),0 0 56px rgba(35,176,143,0.15)}}
.aab .glow-box h3{font-family:"Fraunces",serif;font-size:20px;font-weight:500;margin:0 0 12px;}
.aab .glow-box p{font-size:14px;margin:0 0 8px;}
.aab .glow-box ul{list-style:none;padding:0;margin:14px 0 0;}
.aab .glow-box li{font-size:13.5px;padding:7px 0 7px 20px;position:relative;line-height:1.6;}
.aab .glow-box li .gdot{width:8px;height:8px;border-radius:50%;background:linear-gradient(145deg,var(--primary-lighter),var(--primary));box-shadow:0 0 8px rgba(35,176,143,0.35);position:absolute;left:0;top:13px;}
.aab .cred-card{background:var(--field);border:1.5px solid var(--line-strong);border-radius:14px;padding:16px;margin-bottom:20px;text-align:left;}
.aab .cred-title{font-size:13px;font-weight:700;color:var(--primary);margin-bottom:16px;letter-spacing:.04em;text-transform:uppercase;}
.aab .cred-row{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px 0;border-bottom:1px solid var(--line);}
.aab .cred-row:last-of-type{border-bottom:none;}
.aab .cred-label{font-size:12px;color:var(--muted);font-weight:500;}
.aab .cred-val{font-size:16px;font-weight:700;word-break:break-all;letter-spacing:.02em;}
.aab .pw-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border-radius:11px;border:1.5px solid rgba(35,176,143,0.3);background:rgba(35,176,143,0.04);animation:aabPwG 2s ease-in-out infinite alternate;width:100%;flex-wrap:wrap;justify-content:space-between;}
@keyframes aabPwG{from{box-shadow:0 0 8px rgba(35,176,143,0.1)}to{box-shadow:0 0 18px rgba(35,176,143,0.3),0 0 36px rgba(35,176,143,0.1)}}
.aab .pw-dots{font-size:22px;letter-spacing:4px;color:var(--muted-2);}
.aab .pw-reveal{font-size:12px;color:#fff;font-weight:700;background:linear-gradient(145deg,var(--primary-lighter),var(--primary));border:none;border-radius:10px;padding:6px 14px;white-space:nowrap;box-shadow:0 4px 14px -4px var(--primary);cursor:pointer;}
.aab .cred-note{font-size:12.5px;color:var(--muted);margin-top:12px;padding:10px 14px;background:var(--primary-soft);border-radius:10px;display:flex;gap:8px;align-items:flex-start;}
.aab .access-split{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;}
@media(max-width:560px){.aab .access-split{grid-template-columns:1fr;}}
.aab .access-side{background:var(--field);border:1px solid var(--line-strong);border-radius:14px;padding:22px;text-align:center;}
.aab .access-side h4{font-family:"Fraunces",serif;font-size:15px;margin:0 0 8px;}
.aab .access-side p{font-size:13px;color:var(--muted);margin:0 0 14px;}
.aab .guide-trigger{display:flex;align-items:center;justify-content:center;gap:14px;cursor:pointer;padding:22px 24px;margin-bottom:16px;border-radius:16px;background:linear-gradient(150deg,rgba(15,138,114,0.08),rgba(95,208,168,0.05));border:1.5px solid rgba(35,176,143,0.3);animation:aabGuideG 2.5s ease-in-out infinite alternate;}
@keyframes aabGuideG{from{border-color:rgba(35,176,143,0.25);box-shadow:0 0 14px rgba(35,176,143,0.12)}to{border-color:rgba(35,176,143,0.55);box-shadow:0 0 24px rgba(35,176,143,0.3),0 0 50px rgba(35,176,143,0.12)}}
.aab .guide-trigger .garrow{width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,var(--primary-lighter),var(--primary));display:grid;place-items:center;box-shadow:0 0 18px rgba(35,176,143,0.35);transition:transform .3s;flex-shrink:0;animation:aabBounce 1.5s ease-in-out infinite;}
@keyframes aabBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@keyframes aabHint{0%,100%{opacity:1}50%{opacity:.4}}
.aab .guide-trigger .garrow svg{width:16px;height:16px;color:#fff;}
.aab .guide-trigger.open .garrow{animation:none;transform:rotate(180deg);}
.aab .guide-trigger .gtitle{font-family:"Fraunces",serif;font-size:20px;font-weight:600;}
.aab .guide-trigger .gsub{font-size:13px;color:var(--muted);}
.aab .guide-body{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.2,.7,.2,1);}.aab .guide-body.open{max-height:2000px;}
.aab .gplatform{background:var(--field);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:10px;}
.aab .gplatform h5{font-size:14px;font-weight:700;margin:0 0 8px;}
.aab .gplatform ol{padding-left:20px;font-size:13.5px;}.aab .gplatform ol li{padding:4px 0;}.aab .gplatform ol li b{color:var(--primary);}
.aab .app-note{text-align:center;font-size:12.5px;color:var(--muted);margin-top:20px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--field);}`;

interface Props {
  patientId: string;
  modus?: "patient" | "praxis";
}

type StepName =
  | "versicherung" | "patient" | "versicherter" | "zahler"
  | "behandlung" | "gesundheit" | "einwilligungen" | "abschluss";

const STEPS: StepName[] = [
  "versicherung", "patient", "versicherter", "zahler",
  "behandlung", "gesundheit", "einwilligungen", "abschluss",
];

const STEP_TITLES: Record<StepName, string> = {
  versicherung: "Versicherung",
  patient: "Patient",
  versicherter: "Versicherter",
  zahler: "Zahler",
  behandlung: "Behandlung",
  gesundheit: "Gesundheit",
  einwilligungen: "Einwilligungen",
  abschluss: "Abschluss",
};

interface MedQ {
  key: string;
  t: string;
  f?: string;
  choice?: string[];
}

const MEDS: MedQ[] = [
  { key: "g_behandlung_aktuell", t: "Ist der Patient zurzeit in ärztlicher Behandlung?", f: "Wenn ja, wegen welcher Erkrankung?" },
  { key: "g_erkrankungen", t: "Bestehen allgemeine Erkrankungen (z. B. Asthma, Diabetes, Herzfehler, HIV, Hepatitis, Epilepsie)?", f: "Wenn ja, welche?" },
  { key: "g_medikamente", t: "Werden regelmäßig Medikamente eingenommen?", f: "Wenn ja, welche?" },
  { key: "g_allergien", t: "Bestehen Allergien oder Unverträglichkeiten gegen Medikamente oder Materialien?", f: "Wenn ja, welche?" },
  { key: "g_physio", t: "Wurde eine physiotherapeutische oder osteopathische Behandlung durchgeführt?" },
  { key: "g_hno", t: "Bestand eine Behandlung bei einem HNO-Arzt?" },
  { key: "g_atmung", t: "Wird durch die Nase oder den Mund geatmet?", choice: ["Nase", "Mund"] },
  { key: "g_kfo_frueher", t: "Gab es schon einmal eine kieferorthopädische Behandlung?" },
  { key: "g_op_mund", t: "Operationen im Mund-/Kieferbereich (z. B. Lippenbändchen, Gaumenspalte)?" },
  { key: "g_kiefergelenk", t: "Bestehen Kiefergelenkbeschwerden oder -knacken?" },
  { key: "g_kopfschmerzen", t: "Bestehen häufige Kopf- oder Nackenschmerzen?" },
  { key: "g_knirschen", t: "Besteht nächtliches Zähneknirschen?" },
  { key: "g_logopaedie", t: "Bestand eine logopädische Behandlung?" },
  { key: "g_unfaelle", t: "Gab es Unfälle mit Beteiligung der Zähne oder des Kiefers?" },
  { key: "g_lutschen", t: "Besteht eine Lutschgewohnheit (Daumen, Finger, Schnuller), Lippen- oder Nägelbeißen?", f: "Wenn ja, bitte beschreiben und in welchem Alter." },
  { key: "g_geschwister_kfo", t: "Sind Geschwister in kieferorthopädischer Behandlung?" },
  { key: "g_instrument", t: "Wird ein Musikinstrument gespielt?", f: "Wenn ja, welches?" },
  { key: "g_roentgen_jahr", t: "Wurde im letzten Jahr im Kopf-, Kiefer- oder Zahnbereich geröntgt?" },
  { key: "g_schwangerschaft", t: "Besteht zurzeit eine Schwangerschaft?" },
];

interface ConsentDef {
  key: string;
  label: string;
  pflicht: boolean;
  hint?: string;
}

const CONSENTS: ConsentDef[] = [
  { key: "ew_roentgen", label: "Ich stimme zu, dass im Rahmen der kieferorthopädischen Behandlung notwendige Röntgenuntersuchungen durchgeführt werden dürfen. Vor jeder Aufnahme werde ich erneut informiert.", pflicht: true },
  { key: "ew_befunde", label: "Ich stimme zu, dass Befunde und Behandlungsdaten (z. B. vorhandene Röntgenbilder) bei anderen Leistungserbringern wie Zahnarzt oder Hausarzt angefordert und erhobene Befunde an mitbehandelnde Ärzte weitergeleitet werden dürfen.", pflicht: false },
  { key: "ew_epa", label: "Ich stimme zu, dass die Praxis Behandlungsdaten in meine elektronische Patientenakte (ePA) einstellen und von dort abrufen darf.", pflicht: false },
  { key: "ew_digitale_rechnung", label: "Zugunsten der Umwelt verzichte ich auf Papierrechnungen und stimme dem Erhalt meiner Rechnungen auf digitalem Weg zu.", pflicht: false, hint: "Empfohlen: So liegen alle Rechnungen jederzeit digital in Ihrer Anima Cura App bereit." },
  { key: "ew_anima", label: "Ich stimme zu, dass meine Daten in der Anima Cura Plattform gespeichert und verarbeitet werden, damit ich Unterlagen, Termine und Rechnungen dort einsehen kann, und dass ich über die Plattform für Folgetermine kontaktiert werden darf.", pflicht: false },
];

const SignaturePad = forwardRef<HTMLCanvasElement, { fehlt?: boolean; onSign?: () => void }>(function SignaturePad({ fehlt, onSign }, ref) {
  const innerRef = useRef<HTMLCanvasElement | null>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLCanvasElement, []);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = innerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * 2;
    c.height = rect.height * 2;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = innerRef.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = point(e);
    onSign?.();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const c = innerRef.current as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.strokeStyle = getComputedStyle(c).color || "#1d2a27";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = innerRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  };

  return (
    <>
      <canvas
        ref={innerRef}
        className={"sigpad" + (fehlt ? " fehlt" : "")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="sigbar">
        <span className="hint">Mit Finger oder Maus unterschreiben</span>
        <button className="linkbtn" type="button" onClick={clear}>Löschen</button>
      </div>
    </>
  );
});

const DONE_T: Record<string, Record<string, string | string[]>> = {
  de: { thanks: "Vielen Dank", received: "Dein Anamnesebogen ist bei uns eingegangen. Du erh\u00e4ltst deine unterschriebenen Unterlagen per E-Mail. Unsere Praxis hat bereits alles vorliegen.",
    next: "Was kommt als N\u00e4chstes?", appTitle: "Deine pers\u00f6nliche Anima Cura App",
    appDesc: "Ab sofort steht dir ein eigener, gesch\u00fctzter Bereich zur Verf\u00fcgung. Kein Papierchaos, keine verlorenen Briefe, alles an einem Ort, jederzeit abrufbar von deinem Handy aus.",
    f1: "Alle Rechnungen und Zahlungspl\u00e4ne \u00fcbersichtlich an einem Ort", f2: "Deine Dokumente: Befunde, R\u00f6ntgenbilder, Behandlungspl\u00e4ne",
    f3: "\u00dcberblick \u00fcber deine Behandlungsphasen und den aktuellen Stand", f4: "Deine Ratenzahlungen: was bezahlt wurde, was noch offen ist", f5: "Nachrichten von der Praxis direkt in der App",
    credLabel: "Deine Zugangsdaten", credTitle: "Deine Login-Daten", emailLabel: "Login-E-Mail", pwLabel: "Passwort", pwTap: "Tippen zum Anzeigen", pwHide: "Verbergen",
    secNote: "Die Login-E-Mail @animacura.de ist ein internes Praxis-System. Wir erstellen diesen Zugang einzig und allein daf\u00fcr, damit du sicher und gesch\u00fctzt auf deine pers\u00f6nliche App zugreifen kannst. Deine private E-Mail-Adresse bleibt davon unber\u00fchrt.",
    screenshot: "Mach am besten einen Screenshot von diesen Daten. Du kannst das Passwort nach dem ersten Login jederzeit in der App \u00e4ndern.",
    openLabel: "App \u00f6ffnen", qrTitle: "Vom Handy scannen", qrDesc: "Du f\u00fcllst den Bogen gerade am Tablet oder Computer aus? Scanne den QR-Code mit deinem Handy.",
    qrHint: "\u00d6ffne die Kamera-App und halte sie auf den Code.", btnTitle: "Direkt \u00f6ffnen", btnDesc: "Du bist bereits am Handy? Tippe auf den Button und logge dich mit deinen neuen Zugangsdaten ein.", btnText: "Anima Cura \u00f6ffnen",
    tapHint: "Hier dr\u00fccken", guideTitle: "So gehts los!", guideSub: "App auf deinem Homescreen installieren, Schritt f\u00fcr Schritt",
    guideIntro: "Anima Cura ist eine Web-App. Du brauchst nichts aus dem App Store herunterladen. Du kannst sie aber wie eine normale App auf deinem Startbildschirm ablegen. Danach \u00f6ffnet sie sich mit einem einzigen Tipp.",
    ios: ["\u00d6ffne die App in Safari (nicht Chrome oder andere Browser)", "Tippe unten auf das Teilen-Symbol (das Quadrat mit dem Pfeil nach oben)", "Scrolle nach unten und tippe auf Zum Home-Bildschirm", "Tippe auf Hinzuf\u00fcgen"],
    and: ["\u00d6ffne die App in Chrome", "Tippe auf die drei Punkte oben rechts", "Zum Startbildschirm hinzuf\u00fcgen", "Best\u00e4tige mit Hinzuf\u00fcgen"],
    appNote: "Die App ist vorerst auf Deutsch, Englisch und Spanisch verf\u00fcgbar. Weitere Sprachen folgen.",
    loading: ["Dein Account wird erstellt...", "Zugangsdaten werden generiert...", "Fast fertig..."], success: "Dein Account ist erstellt!", footer: "Bei Fragen sind wir f\u00fcr dich da." },
  en: { thanks: "Thank you", received: "Your medical history form has been received. You will receive your signed documents by email. Our practice already has everything on file.",
    next: "What happens next?", appTitle: "Your personal Anima Cura App",
    appDesc: "From now on, you have your own secure space where you can find everything about your treatment. No paper clutter, no lost letters, everything in one place, accessible anytime from your phone.",
    f1: "All your invoices and payment plans in one place", f2: "Your documents: findings, X-rays, treatment plans",
    f3: "Overview of your treatment phases and current status", f4: "Your installment payments: what has been paid, what is still open", f5: "Messages from the practice directly in the app",
    credLabel: "Your login credentials", credTitle: "Your login details", emailLabel: "Login email", pwLabel: "Password", pwTap: "Tap to reveal", pwHide: "Hide",
    secNote: "The @animacura.de login email is an internal practice system. We create this access solely so you can securely access your personal app. Your private email address remains unaffected.",
    screenshot: "Take a screenshot of these details. You can change your password anytime after your first login.",
    openLabel: "Open the app", qrTitle: "Scan from your phone", qrDesc: "Filling out the form on a tablet or computer? Scan the QR code with your phone.",
    qrHint: "Open the Camera app and point it at the code.", btnTitle: "Open directly", btnDesc: "Already on your phone? Tap the button and log in with your new credentials.", btnText: "Open Anima Cura",
    tapHint: "Tap here", guideTitle: "Lets get started!", guideSub: "Install the app on your home screen, step by step",
    guideIntro: "Anima Cura is a web app. You do not need to download anything from the App Store. But you can add it to your home screen just like a regular app. After that, it opens with a single tap.",
    ios: ["Open the app in Safari (not Chrome or other browsers)", "Tap the Share button at the bottom (the square with an upward arrow)", "Scroll down and tap Add to Home Screen", "Tap Add"],
    and: ["Open the app in Chrome", "Tap the three dots in the top right", "Add to Home screen", "Confirm with Add"],
    appNote: "The app is currently available in German, English and Spanish. More languages coming soon.",
    loading: ["Creating your account...", "Generating login credentials...", "Almost done..."], success: "Your account is ready!", footer: "Questions? We are here for you." },
  es: { thanks: "Gracias", received: "Hemos recibido tu formulario. Recibir\u00e1s tus documentos firmados por correo electr\u00f3nico. Nuestra consulta ya tiene todo archivado.",
    next: "Que viene ahora?", appTitle: "Tu app personal Anima Cura",
    appDesc: "A partir de ahora tienes tu propio espacio seguro donde encontrar\u00e1s todo sobre tu tratamiento. Sin papeles perdidos, sin cartas extraviadas, todo en un solo lugar, accesible en cualquier momento desde tu m\u00f3vil.",
    f1: "Todas tus facturas y planes de pago en un solo lugar", f2: "Tus documentos: diagn\u00f3sticos, radiograf\u00edas, planes de tratamiento",
    f3: "Vista general de tus fases de tratamiento y estado actual", f4: "Tus pagos a plazos: lo que se ha pagado, lo que queda pendiente", f5: "Mensajes de la consulta directamente en la app",
    credLabel: "Tus datos de acceso", credTitle: "Tus datos de inicio de sesi\u00f3n", emailLabel: "E-mail de acceso", pwLabel: "Contrase\u00f1a", pwTap: "Pulsa para ver", pwHide: "Ocultar",
    secNote: "El correo @animacura.de es un sistema interno de la consulta. Creamos este acceso \u00fanicamente para que puedas acceder de forma segura a tu app personal. Tu correo privado no se ve afectado.",
    screenshot: "Haz una captura de pantalla de estos datos. Puedes cambiar tu contrase\u00f1a en cualquier momento despu\u00e9s de iniciar sesi\u00f3n.",
    openLabel: "Abrir la app", qrTitle: "Escanear desde el m\u00f3vil", qrDesc: "Est\u00e1s rellenando el formulario en una tablet o un ordenador? Escanea el c\u00f3digo QR con tu m\u00f3vil.",
    qrHint: "Abre la c\u00e1mara y apunta al c\u00f3digo.", btnTitle: "Abrir directamente", btnDesc: "Ya est\u00e1s en el m\u00f3vil? Pulsa el bot\u00f3n e inicia sesi\u00f3n con tus nuevos datos.", btnText: "Abrir Anima Cura",
    tapHint: "Pulsa aqu\u00ed", guideTitle: "Empezamos!", guideSub: "Instala la app en tu pantalla de inicio, paso a paso",
    guideIntro: "Anima Cura es una web app. No necesitas descargar nada de la App Store. Pero puedes a\u00f1adirla a tu pantalla de inicio como una app normal. Despu\u00e9s se abre con un solo toque.",
    ios: ["Abre la app en Safari (no Chrome u otros navegadores)", "Pulsa el bot\u00f3n de compartir en la parte inferior", "A\u00f1adir a la pantalla de inicio", "Pulsa A\u00f1adir"],
    and: ["Abre la app en Chrome", "Pulsa los tres puntos arriba a la derecha", "A\u00f1adir a pantalla de inicio", "Confirma con A\u00f1adir"],
    appNote: "La app est\u00e1 disponible de momento en alem\u00e1n, ingl\u00e9s y espa\u00f1ol. M\u00e1s idiomas pr\u00f3ximamente.",
    loading: ["Creando tu cuenta...", "Generando datos de acceso...", "Casi listo..."], success: "Tu cuenta est\u00e1 lista!", footer: "Preguntas? Estamos aqu\u00ed para ti." },
  ru: { thanks: "\u0421\u043f\u0430\u0441\u0438\u0431\u043e", received: "\u0422\u0432\u043e\u044f \u0430\u043d\u043a\u0435\u0442\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430. \u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u043d\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u043f\u0440\u0438\u0434\u0443\u0442 \u0442\u0435\u0431\u0435 \u043d\u0430 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u0443\u044e \u043f\u043e\u0447\u0442\u0443.",
    next: "\u0427\u0442\u043e \u0434\u0430\u043b\u044c\u0448\u0435?", appTitle: "\u0422\u0432\u043e\u0451 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 Anima Cura", appDesc: "\u0422\u0435\u043f\u0435\u0440\u044c \u0443 \u0442\u0435\u0431\u044f \u0435\u0441\u0442\u044c \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0437\u0430\u0449\u0438\u0449\u0451\u043d\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e.",
    f1: "\u0412\u0441\u0435 \u0441\u0447\u0435\u0442\u0430 \u0438 \u043f\u043b\u0430\u0442\u0451\u0436\u043d\u044b\u0435 \u043f\u043b\u0430\u043d\u044b", f2: "\u0422\u0432\u043e\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b", f3: "\u041e\u0431\u0437\u043e\u0440 \u044d\u0442\u0430\u043f\u043e\u0432 \u043b\u0435\u0447\u0435\u043d\u0438\u044f", f4: "\u0422\u0432\u043e\u0438 \u0440\u0430\u0441\u0441\u0440\u043e\u0447\u043a\u0438", f5: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043e\u0442 \u043a\u043b\u0438\u043d\u0438\u043a\u0438",
    credLabel: "\u0422\u0432\u043e\u0438 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430", credTitle: "\u0422\u0432\u043e\u0438 \u043b\u043e\u0433\u0438\u043d-\u0434\u0430\u043d\u043d\u044b\u0435", emailLabel: "E-mail", pwLabel: "\u041f\u0430\u0440\u043e\u043b\u044c", pwTap: "\u041d\u0430\u0436\u043c\u0438", pwHide: "\u0421\u043a\u0440\u044b\u0442\u044c",
    secNote: "@animacura.de \u2014 \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u044f\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u043a\u043b\u0438\u043d\u0438\u043a\u0438.", screenshot: "\u0421\u0434\u0435\u043b\u0430\u0439 \u0441\u043a\u0440\u0438\u043d\u0448\u043e\u0442.",
    openLabel: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c", qrTitle: "\u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c", qrDesc: "\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439 QR-\u043a\u043e\u0434.", qrHint: "\u041e\u0442\u043a\u0440\u043e\u0439 \u043a\u0430\u043c\u0435\u0440\u0443.", btnTitle: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c", btnDesc: "\u0423\u0436\u0435 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435?", btnText: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c Anima Cura",
    tapHint: "\u041d\u0430\u0436\u043c\u0438 \u0441\u044e\u0434\u0430", guideTitle: "\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u043c!", guideSub: "\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 \u043d\u0430 \u0434\u043e\u043c\u0430\u0448\u043d\u0438\u0439 \u044d\u043a\u0440\u0430\u043d",
    guideIntro: "Anima Cura \u2014 \u044d\u0442\u043e \u0432\u0435\u0431-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435.",
    ios: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 Safari", "\u041d\u0430\u0436\u043c\u0438 \u041f\u043e\u0434\u0435\u043b\u0438\u0442\u044c\u0441\u044f", "\u041d\u0430 \u044d\u043a\u0440\u0430\u043d \u0414\u043e\u043c\u043e\u0439", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c"],
    and: ["\u041e\u0442\u043a\u0440\u043e\u0439 \u0432 Chrome", "\u0422\u0440\u0438 \u0442\u043e\u0447\u043a\u0438 \u0432\u0432\u0435\u0440\u0445\u0443", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u044d\u043a\u0440\u0430\u043d", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c"],
    appNote: "\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u043d\u0435\u043c\u0435\u0446\u043a\u043e\u043c, \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u043e\u043c \u0438 \u0438\u0441\u043f\u0430\u043d\u0441\u043a\u043e\u043c.",
    loading: ["\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0430\u043a\u043a\u0430\u0443\u043d\u0442...", "\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c \u0434\u0430\u043d\u043d\u044b\u0435...", "\u041f\u043e\u0447\u0442\u0438 \u0433\u043e\u0442\u043e\u0432\u043e..."], success: "\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0433\u043e\u0442\u043e\u0432!", footer: "\u0412\u043e\u043f\u0440\u043e\u0441\u044b? \u041c\u044b \u0440\u044f\u0434\u043e\u043c." },
  tr: { thanks: "Te\u015fekk\u00fcrler", received: "Anamnez formun bize ula\u015ft\u0131. Muayenehanemiz her \u015feyi kay\u0131t alt\u0131na ald\u0131.",
    next: "S\u0131rada ne var?", appTitle: "Anima Cura Uygulaman", appDesc: "Art\u0131k tedavinle ilgili her \u015feyi bulabilece\u011fin kendi g\u00fcvenli alan\u0131n var.",
    f1: "T\u00fcm faturalar ve \u00f6deme planlar\u0131", f2: "Belgelerin", f3: "Tedavi a\u015famalar\u0131", f4: "Taksit \u00f6demelerin", f5: "Mesajlar",
    credLabel: "Giri\u015f bilgilerin", credTitle: "Giri\u015f bilgilerin", emailLabel: "Giri\u015f e-postas\u0131", pwLabel: "\u015eifre", pwTap: "G\u00f6rmek i\u00e7in dokun", pwHide: "Gizle",
    secNote: "@animacura.de dahili bir muayenehane sistemidir.", screenshot: "Ekran g\u00f6r\u00fcnt\u00fcs\u00fc al.",
    openLabel: "Uygulamay\u0131 a\u00e7", qrTitle: "Telefonla tara", qrDesc: "QR kodu telefonunla tara.", qrHint: "Kameray\u0131 a\u00e7.", btnTitle: "Do\u011frudan a\u00e7", btnDesc: "Zaten telefondaysan?", btnText: "Anima Cura a\u00e7",
    tapHint: "Buraya dokun", guideTitle: "Haydi ba\u015flayal\u0131m!", guideSub: "Uygulamay\u0131 ana ekran\u0131na kur",
    guideIntro: "Anima Cura bir web uygulamas\u0131d\u0131r.",
    ios: ["Safari ile a\u00e7", "Payla\u015f d\u00fc\u011fmesine dokun", "Ana Ekrana Ekle", "Ekle"],
    and: ["Chrome ile a\u00e7", "\u00dc\u00e7 noktaya dokun", "Ana ekrana ekle", "Ekle"],
    appNote: "Uygulama \u015fu an Almanca, \u0130ngilizce ve \u0130spanyolca mevcut.",
    loading: ["Hesab\u0131n olu\u015fturuluyor...", "Giri\u015f bilgileri \u00fcretiliyor...", "Neredeyse bitti..."], success: "Hesab\u0131n haz\u0131r!", footer: "Sorular\u0131n m\u0131 var? Buraday\u0131z." },
};

const DONE_APP_URL = "https://animacura.io/patient/login";
const DONE_QR_URL = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(DONE_APP_URL) + "&bgcolor=fdfbf7&color=1d2a27";

function DoneScreen({ account, lang, setLang, showPw, setShowPw, guideOpen, setGuideOpen, vorname }: {
  account: { login_email: string; password: string } | null;
  lang: "de"|"en"|"es"|"ru"|"tr"; setLang: (l: "de"|"en"|"es"|"ru"|"tr") => void;
  showPw: boolean; setShowPw: (v: boolean) => void;
  guideOpen: boolean; setGuideOpen: (v: boolean) => void;
  vorname: string;
}) {
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [loadIdx, setLoadIdx] = useState(0);

  useEffect(() => {
    if (!account) return;
    const timer = setTimeout(() => { setLoading(false); setTimeout(() => setRevealed(true), 300); }, 6000);
    return () => clearTimeout(timer);
  }, [account]);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setLoadIdx((i) => (i + 1) % 3), 2000);
    return () => clearInterval(iv);
  }, [loading]);

  const t = DONE_T[lang] as Record<string, unknown>;
  const ios = t.ios as string[];
  const and = t.and as string[];
  const loadingTxts = t.loading as string[];
  const name = vorname || "Patient";
  const check = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;

  return (
    <div className="done-screen show">
      <div className="ring">{check}</div>
      <h2>{t.thanks as string}, {name}!</h2>
      <p>{t.received as string}</p>
      <div className="done-lang-bar">
        {(["de","en","es","ru","tr"] as const).map((c) => (
          <button key={c} type="button" className={"done-lang-btn" + (lang === c ? " on" : "")} onClick={() => setLang(c)}>
            {c === "de" ? "DE" : c === "en" ? "EN" : c === "es" ? "ES" : c === "ru" ? "RU" : "TR"}
          </button>
        ))}
      </div>
      {account && loading && (<div style={{marginTop:20}}><div className="shimmer-bar"><div className="shimmer-track" /></div><div className="shimmer-text">{loadingTxts[loadIdx]}</div></div>)}
      {account && !loading && !revealed && (<div className="success-flash" style={{animation:"aabSlide .5s ease"}}><div className="success-badge"><div className="schk">{check}</div><span>{t.success as string}</span></div></div>)}
      {account && revealed && (<div className="account-reveal">
        <div className="success-flash"><div className="success-badge"><div className="schk">{check}</div><span>{t.success as string}</span></div></div>
        <div className="done-divider" />
        <div className="done-slabel">{t.next as string}</div>
        <div className="glow-box" style={{textAlign:"left"}}><h3>{t.appTitle as string}</h3><p>{t.appDesc as string}</p>
          <ul>{[t.f1,t.f2,t.f3,t.f4,t.f5].map((f,i) => <li key={i}><span className="gdot" />{f as string}</li>)}</ul></div>
        <div className="done-divider" />
        <div className="done-slabel">{t.credLabel as string}</div>
        <div className="cred-card"><div className="cred-title">{t.credTitle as string}</div>
          <div className="cred-row"><span className="cred-label">{t.emailLabel as string}</span><span className="cred-val">{account.login_email}</span></div>
          <div className="cred-row"><span className="cred-label">{t.pwLabel as string}</span>
            <div className="pw-toggle" onClick={() => setShowPw(!showPw)}>
              {showPw ? <span className="cred-val">{account.password}</span> : <span className="pw-dots">{"●".repeat(10)}</span>}
              <span className="pw-reveal">{showPw ? (t.pwHide as string) : (t.pwTap as string)}</span>
            </div></div>
          <div className="cred-note" style={{marginBottom:10}}><span>{"🔒"}</span><div>{t.secNote as string}</div></div>
          <div className="cred-note"><span>{"📸"}</span><div>{t.screenshot as string}</div></div></div>
        <div className="done-divider" />
        <div className="done-slabel">{t.openLabel as string}</div>
        <div className="access-split">
          <div className="access-side"><h4>{t.qrTitle as string}</h4><p>{t.qrDesc as string}</p>
            <img src={DONE_QR_URL} alt="QR" width="160" height="160" style={{borderRadius:8}} />
            <div style={{fontSize:"11.5px",color:"var(--muted-2)",marginTop:10}}>{t.qrHint as string}</div></div>
          <div className="access-side"><h4>{t.btnTitle as string}</h4><p>{t.btnDesc as string}</p>
            <a href={DONE_APP_URL} target="_blank" rel="noopener noreferrer" className="btn primary" style={{display:"block",textAlign:"center",textDecoration:"none"}}>{t.btnText as string}</a></div></div>
        <div className="done-divider" />
        <div style={{textAlign:"center",marginBottom:6,fontSize:12,color:"var(--primary-bright)",fontWeight:600,animation:"aabHint 2s ease-in-out infinite"}}>{t.tapHint as string}</div>
        <div className={"guide-trigger" + (guideOpen ? " open" : "")} onClick={() => setGuideOpen(!guideOpen)}>
          <div><div className="gtitle">{t.guideTitle as string}</div><div className="gsub">{t.guideSub as string}</div></div>
          <div className="garrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></div></div>
        <div className={"guide-body" + (guideOpen ? " open" : "")}>
          <p style={{fontSize:14,color:"var(--muted)",marginBottom:16}}>{t.guideIntro as string}</p>
          <div className="gplatform"><h5>iPhone / iPad (Safari)</h5><ol>{ios.map((s,i) => <li key={i}><b>{s}</b></li>)}</ol></div>
          <div className="gplatform"><h5>Android (Chrome)</h5><ol>{and.map((s,i) => <li key={i}><b>{s}</b></li>)}</ol></div></div>
        <div className="app-note">{t.appNote as string}</div>
      </div>)}
      {!account && !loading && (<span className="applink">In der Anima Cura App haben Sie alles jederzeit griffbereit.</span>)}
    </div>
  );
}


export function AnamneseForm({ patientId }: Props) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [stepName, setStepName] = useState<StepName>("versicherung");
  const [done, setDone] = useState(false);
  const [fehlen, setFehlen] = useState<string[]>([]);
  const [account, setAccount] = useState<{ login_email: string; password: string } | null>(null);
  const [lang, setLang] = useState<"de"|"en"|"es"|"ru"|"tr">("de");
  const [showPw, setShowPw] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [gruende, setGruende] = useState<Record<string, string>>({});

  // Photon Adress-Autocomplete (OpenStreetMap, kein API Key noetig)
  const [addrSuggestions, setAddrSuggestions] = useState<Array<{street:string;house:string;zip:string;city:string;display:string}>>([]);
  const [addrTimer, setAddrTimer] = useState<ReturnType<typeof setTimeout>|null>(null);
  const handleAddrInput = (val: string) => {
    set("patient_strasse", val);
    if (addrTimer) clearTimeout(addrTimer);
    if (val.length < 3) { setAddrSuggestions([]); return; }
    setAddrTimer(setTimeout(async () => {
      try {
        const res = await fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(val) + "&lang=de&limit=5&lat=51.34&lon=12.37");
        const photonRes = await res.json();
        const items = (photonRes.features || []).map((f: { properties: Record<string, string> }) => {
          const p = f.properties || {};
          return {
            street: p.street || p.name || "",
            house: p.housenumber || "",
            zip: p.postcode || "",
            city: p.city || p.town || p.village || "",
            display: [p.street || p.name, p.housenumber, p.postcode, p.city || p.town || p.village].filter(Boolean).join(", "),
          };
        }).filter((item: { street: string }) => item.street);
        setAddrSuggestions(items);
      } catch { setAddrSuggestions([]); }
    }, 350));
  };
  const selectAddr = (item: {street:string;house:string;zip:string;city:string}) => {
    set("patient_strasse", item.street);
    if (item.house) set("patient_hausnummer", item.house);
    if (item.zip) set("patient_plz", item.zip);
    if (item.city) set("patient_wohnort", item.city);
    setAddrSuggestions([]);
  };

  const sig1 = useRef<HTMLCanvasElement | null>(null);
  const sig2 = useRef<HTMLCanvasElement | null>(null);

  const set = (key: string, value: unknown) => {
    setData((d) => ({ ...d, [key]: value }));
    setFehlen((f) => (f.includes(key) ? f.filter((k) => k !== key) : f));
    setGruende((g) => {
      if (!(key in g)) return g;
      const n = { ...g };
      delete n[key];
      return n;
    });
  };
  const txt = (key: string) => (data[key] as string) ?? "";

  const PFLICHT: Record<StepName, string[]> = {
    versicherung: ["versicherungsart", "krankenkasse"],
    patient: ["patient_vorname", "patient_nachname", "patient_geburtsdatum", "patient_geschlecht", "patient_telefon", "patient_strasse", "patient_hausnummer", "patient_plz", "patient_wohnort", "patient_email", "patient_mobil"],
    versicherter: ["vp_vorname", "vp_nachname", "vp_telefon"],
    zahler: ["ist_selbstzahler", "ist_vn"],
    behandlung: ["besuchsgrund"],
    gesundheit: [...MEDS.map((m) => m.key), "g_zaehneputzen"],
    einwilligungen: ["ew_roentgen"],
    abschluss: ["abschluss_datum", "abschluss_ort", "unterschrift_sig1"],
  };

  const sigLeer = (c: HTMLCanvasElement | null): boolean => {
    if (!c) return true;
    const blank = document.createElement("canvas");
    blank.width = c.width;
    blank.height = c.height;
    return c.toDataURL() === blank.toDataURL();
  };

  const istLeer = (key: string): boolean => {
    if (key === "unterschrift_sig1") return sigLeer(sig1.current);
    const v = data[key];
    if (v === undefined || v === null || v === false) return true;
    return typeof v === "string" && v.trim() === "";
  };

  const PRUEFUNG: Record<string, (v: string) => PruefErgebnis> = {
    patient_vorname: pruefeName,
    patient_nachname: pruefeName,
    vp_vorname: pruefeName,
    vp_nachname: pruefeName,
    zahler_vorname: pruefeName,
    zahler_nachname: pruefeName,
    vn_vorname: pruefeName,
    vn_nachname: pruefeName,
    patient_email: pruefeEmail,
    patient_telefon: pruefeTelefon,
    patient_mobil: pruefeTelefon,
    vp_telefon: pruefeTelefon,
    zahler_telefon: pruefeTelefon,
    patient_plz: pruefePlz,
    patient_hausnummer: pruefeHausnummer,
    patient_geburtsdatum: (v) => pruefeDatum(v, { geburt: true }),
    zahler_geburtsdatum: (v) => pruefeDatum(v, { geburt: true }),
    abschluss_datum: (v) => pruefeDatum(v),
    krankenkasse: (v) => pruefeText(v, 2),
    patient_strasse: (v) => pruefeText(v, 2, false),
    patient_wohnort: (v) => pruefeText(v, 2),
    abschluss_ort: (v) => pruefeText(v, 2),
    besuchsgrund: (v) => pruefeText(v, 3, false),
  };

  const pruefeSchritt = (): { keys: string[]; gruende: Record<string, string> } => {
    const requiredKeys = [...(PFLICHT[stepName] ?? [])];
    if (stepName === "zahler") {
      if (data.ist_selbstzahler === "nein") {
        requiredKeys.push("zahler_vorname", "zahler_nachname", "zahler_telefon");
      }
      if (data.ist_vn === "nein") {
        requiredKeys.push("vn_vorname", "vn_nachname");
      }
    }
    const keys: string[] = [];
    const g: Record<string, string> = {};
    for (const key of requiredKeys) {
      if (istLeer(key)) { keys.push(key); continue; }
      const pf = PRUEFUNG[key];
      if (pf) {
        const r = pf(txt(key));
        if (!r.ok) { keys.push(key); g[key] = r.grund; }
      }
    }
    return { keys, gruende: g };
  };
  const ff = (key: string) => (fehlen.includes(key) ? " fehlt" : "");

  const isMinor = (() => {
    const v = data.patient_geburtsdatum as string | undefined;
    if (!v) return true;
    const age = (Date.now() - new Date(v).getTime()) / (365.25 * 864e5);
    return age < 18;
  })();

  const visibleSteps = STEPS.filter((s) => s !== "versicherter" || isMinor);
  const pos = visibleSteps.indexOf(stepName);
  const total = visibleSteps.length;

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const submit = () => {
    const payload = {
      ...data,
      unterschrift_versicherter: sig1.current ? sig1.current.toDataURL() : null,
      unterschrift_vp2:
        data.vp2_vorhanden === "ja" && sig2.current ? sig2.current.toDataURL() : null,
    };
    // Die exakt angezeigten Texte mitsenden, damit das PDF wortgleich druckt.
    const schema = {
      meds: [
        ...MEDS.map((m) => ({ key: m.key, t: m.t })),
        { key: "g_zaehneputzen", t: "Wie oft werden die Zähne geputzt?" },
      ],
      consents: CONSENTS.map((c) => ({ key: c.key, label: c.label, pflicht: c.pflicht })),
    };
    fetch("/api/anima-sign/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, answers: payload, schema }),
    })
      .then((res) => res.json())
      .then((res) => { if (res.account) setAccount(res.account); })
      .catch((error) => console.error("Anamnese-Übermittlung fehlgeschlagen:", error));
    setDone(true);
    scrollTop();
  };

  const goNext = () => {
    const { keys, gruende: g } = pruefeSchritt();
    if (keys.length > 0) {
      setFehlen(keys);
      setGruende(g);
      scrollTop();
      return;
    }
    setFehlen([]);
    setGruende({});
    if (pos >= total - 1) { submit(); return; }
    setStepName(visibleSteps[pos + 1]);
    scrollTop();
  };

  const goBack = () => {
    if (pos <= 0) return;
    setStepName(visibleSteps[pos - 1]);
    scrollTop();
  };

  const renderYesNo = (name: string) => {
    const v = data[name];
    return (
      <div className={"yn" + ff(name)}>
        <button type="button" className={v === "ja" ? "on" : ""} onClick={() => set(name, "ja")}>Ja</button>
        <button type="button" className={v === "nein" ? "on" : ""} onClick={() => set(name, "nein")}>Nein</button>
      </div>
    );
  };

  const renderPills = (name: string, options: string[]) => {
    const v = data[name];
    return (
      <div className={"pills" + ff(name)}>
        {options.map((o) => (
          <button key={o} type="button" className={v === o ? "on" : ""} onClick={() => set(name, o)}>{o}</button>
        ))}
      </div>
    );
  };

  const renderConsent = (c: ConsentDef) => {
    const on = Boolean(data[c.key]);
    return (
      <div key={c.key} className={"consent" + (on ? " on" : "") + ff(c.key)} onClick={() => set(c.key, !on)}>
        <div className="box">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <div className="ct">{c.label}</div>
          {c.hint && (
            <div className="chint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></svg>
              <span>{c.hint}</span>
            </div>
          )}
          <div className="meta"><span className={"tag " + (c.pflicht ? "pflicht" : "frei")}>{c.pflicht ? "Pflicht" : "Freiwillig"}</span></div>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (stepName) {
      case "versicherung":
        return (
          <section className="step active">
            <h2>Versicherung</h2>
            <p className="sub">Ein paar Angaben zur Krankenversicherung.</p>
            <div className="field col-2">
              <label>Versicherungsart <span className="req">*</span></label>
              {renderPills("versicherungsart", ["Gesetzlich versichert", "Privat versichert", "Beihilfe", "Selbstzahler"])}
            </div>
            <div className="grid">
              <div className="field"><label>Krankenkasse <span className="req">*</span></label><input type="text" placeholder="z. B. AOK, TK …" className={ff("krankenkasse").trim()} value={txt("krankenkasse")} onChange={(e) => set("krankenkasse", e.target.value)} />{gruende["krankenkasse"] ? <span className="fehlt-grund">{gruende["krankenkasse"]}</span> : null}</div>
              <div className="field"><label>Zusatzversicherung? <span className="opt">freiwillig</span></label>{renderYesNo("zusatzversicherung")}</div>
            </div>
            {data.zusatzversicherung === "ja" && (
              <div className="followup show"><div className="field col-2"><label>Welche Zusatzversicherung?</label><input type="text" placeholder="Bezeichnung der Zusatzversicherung" value={txt("zusatzversicherung_welche")} onChange={(e) => set("zusatzversicherung_welche", e.target.value)} /></div></div>
            )}
          </section>
        );
      case "patient":
        return (
          <section className="step active">
            <h2>Angaben zum Patienten</h2>
            <p className="sub">Wer wird bei uns behandelt?</p>
            <div className="grid">
              <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" className={ff("patient_vorname").trim()} value={txt("patient_vorname")} onChange={(e) => set("patient_vorname", e.target.value)} />{gruende["patient_vorname"] ? <span className="fehlt-grund">{gruende["patient_vorname"]}</span> : null}</div>
              <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" className={ff("patient_nachname").trim()} value={txt("patient_nachname")} onChange={(e) => set("patient_nachname", e.target.value)} />{gruende["patient_nachname"] ? <span className="fehlt-grund">{gruende["patient_nachname"]}</span> : null}</div>
              <div className="field col-2"><label>Geburtsdatum <span className="req">*</span></label><input type="date" className={ff("patient_geburtsdatum").trim()} value={txt("patient_geburtsdatum")} onChange={(e) => set("patient_geburtsdatum", e.target.value)} />{gruende["patient_geburtsdatum"] ? <span className="fehlt-grund">{gruende["patient_geburtsdatum"]}</span> : null}<span className="hint">Daraus richten wir den Bogen automatisch passend für Sie ein.</span></div>
              <div className="field"><label>Geschlecht <span className="req">*</span></label><select className={ff("patient_geschlecht").trim()} value={txt("patient_geschlecht")} onChange={(e) => set("patient_geschlecht", e.target.value)}><option value="">Bitte wählen</option><option>Männlich</option><option>Weiblich</option><option>Divers</option></select></div>
              <div className="field"><label>Telefonnummer <span className="req">*</span></label><input type="tel" className={ff("patient_telefon").trim()} value={txt("patient_telefon")} onChange={(e) => set("patient_telefon", e.target.value)} />{gruende["patient_telefon"] ? <span className="fehlt-grund">{gruende["patient_telefon"]}</span> : null}</div>
              <div className="field"><label>Straße <span className="req">*</span></label><div style={{position:"relative"}}><input type="text" autoComplete="off" className={ff("patient_strasse").trim()} value={txt("patient_strasse")} onChange={(e) => handleAddrInput(e.target.value)} onBlur={() => setTimeout(() => setAddrSuggestions([]), 200)} placeholder="Straßenname eingeben..." />{addrSuggestions.length > 0 && <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"#fdfbf7",border:"1.5px solid rgba(29,42,39,0.16)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(40,55,50,0.25)",maxHeight:200,overflowY:"auto"}}>{addrSuggestions.map((item,i) => <div key={i} onMouseDown={() => selectAddr(item)} style={{padding:"10px 14px",fontSize:13.5,cursor:"pointer",borderBottom:"1px solid rgba(29,42,39,0.06)",color:"#1d2a27"}}>{item.display}</div>)}</div>}</div></div>
              <div className="field"><label>Hausnummer <span className="req">*</span></label><input type="text" className={ff("patient_hausnummer").trim()} value={txt("patient_hausnummer")} onChange={(e) => set("patient_hausnummer", e.target.value)} />{gruende["patient_hausnummer"] ? <span className="fehlt-grund">{gruende["patient_hausnummer"]}</span> : null}</div>
              <div className="field"><label>PLZ <span className="req">*</span></label><input type="text" inputMode="numeric" className={ff("patient_plz").trim()} value={txt("patient_plz")} onChange={(e) => set("patient_plz", e.target.value)} />{gruende["patient_plz"] ? <span className="fehlt-grund">{gruende["patient_plz"]}</span> : null}</div>
              <div className="field"><label>Wohnort <span className="req">*</span></label><input type="text" className={ff("patient_wohnort").trim()} value={txt("patient_wohnort")} onChange={(e) => set("patient_wohnort", e.target.value)} />{gruende["patient_wohnort"] ? <span className="fehlt-grund">{gruende["patient_wohnort"]}</span> : null}</div>
              <div className="field col-2"><label>E-Mail-Adresse <span className="req">*</span></label><input type="email" className={ff("patient_email").trim()} value={txt("patient_email")} onChange={(e) => set("patient_email", e.target.value)} />{gruende["patient_email"] ? <span className="fehlt-grund">{gruende["patient_email"]}</span> : null}<span className="hint">Für Terminerinnerungen und Ihre Unterlagen.</span></div>
              <div className="field"><label>Mobilnummer <span className="req">*</span></label><input type="tel" className={ff("patient_mobil").trim()} value={txt("patient_mobil")} onChange={(e) => set("patient_mobil", e.target.value)} />{gruende["patient_mobil"] ? <span className="fehlt-grund">{gruende["patient_mobil"]}</span> : null}</div>
              <div className="field"><label>Beruf</label><input type="text" value={txt("patient_beruf")} onChange={(e) => set("patient_beruf", e.target.value)} /></div>
            </div>
          </section>
        );
      case "versicherter":
        return (
          <section className="step active">
            <h2>Versicherte Person & Erziehungsberechtigte</h2>
            <p className="sub">Da der Patient minderjährig ist, brauchen wir die Angaben der erziehungsberechtigten Person.</p>
            <div className="callout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span>Dieser Schritt erscheint nur, weil der Patient laut Geburtsdatum unter 18 ist. Bei Volljährigen entfällt er.</span>
            </div>
            <div className="grid">
              <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" className={ff("vp_vorname").trim()} value={txt("vp_vorname")} onChange={(e) => set("vp_vorname", e.target.value)} />{gruende["vp_vorname"] ? <span className="fehlt-grund">{gruende["vp_vorname"]}</span> : null}</div>
              <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" className={ff("vp_nachname").trim()} value={txt("vp_nachname")} onChange={(e) => set("vp_nachname", e.target.value)} />{gruende["vp_nachname"] ? <span className="fehlt-grund">{gruende["vp_nachname"]}</span> : null}</div>
              <div className="field"><label>Geburtsdatum</label><input type="date" value={txt("vp_geburtsdatum")} onChange={(e) => set("vp_geburtsdatum", e.target.value)} /></div>
              <div className="field"><label>Telefonnummer <span className="req">*</span></label><input type="tel" className={ff("vp_telefon").trim()} value={txt("vp_telefon")} onChange={(e) => set("vp_telefon", e.target.value)} />{gruende["vp_telefon"] ? <span className="fehlt-grund">{gruende["vp_telefon"]}</span> : null}</div>
              <div className="field"><label>Straße</label><input type="text" value={txt("vp_strasse")} onChange={(e) => set("vp_strasse", e.target.value)} /></div>
              <div className="field"><label>Hausnummer</label><input type="text" value={txt("vp_hausnummer")} onChange={(e) => set("vp_hausnummer", e.target.value)} /></div>
              <div className="field"><label>PLZ</label><input type="text" value={txt("vp_plz")} onChange={(e) => set("vp_plz", e.target.value)} /></div>
              <div className="field"><label>Wohnort</label><input type="text" value={txt("vp_wohnort")} onChange={(e) => set("vp_wohnort", e.target.value)} /></div>
              <div className="field col-2"><label>E-Mail-Adresse</label><input type="email" value={txt("vp_email")} onChange={(e) => set("vp_email", e.target.value)} /></div>
            </div>
            <div className="field col-2" style={{ marginTop: 6 }}><label>Weitere(r) Erziehungsberechtigte(r)? <span className="opt">freiwillig</span></label>{renderYesNo("vp2_vorhanden")}</div>
            {data.vp2_vorhanden === "ja" && (
              <div className="followup show"><div className="grid">
                <div className="field"><label>Vorname</label><input type="text" value={txt("vp2_vorname")} onChange={(e) => set("vp2_vorname", e.target.value)} /></div>
                <div className="field"><label>Nachname</label><input type="text" value={txt("vp2_nachname")} onChange={(e) => set("vp2_nachname", e.target.value)} /></div>
                <div className="field"><label>Telefonnummer</label><input type="tel" value={txt("vp2_telefon")} onChange={(e) => set("vp2_telefon", e.target.value)} /></div>
                <div className="field"><label>E-Mail-Adresse</label><input type="email" value={txt("vp2_email")} onChange={(e) => set("vp2_email", e.target.value)} /></div>
              </div></div>
            )}
          </section>
        );
      case "zahler":
        return (
          <section className="step active">
            <h2>Zahler & Versicherungsnehmer</h2>
            <p className="sub">Bitte teilen Sie uns mit, ob Sie selbst der Zahler und der Versicherungsnehmer sind. Falls nicht, ergänzen Sie bitte die entsprechenden Angaben.</p>
            <div className="field col-2">
              <label>Sind Sie selbst der Zahler? <span className="req">*</span></label>
              {renderYesNo("ist_selbstzahler")}
            </div>
            {data.ist_selbstzahler === "nein" && (
              <div className="followup show">
                <div className="grid">
                  <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" className={ff("zahler_vorname").trim()} value={txt("zahler_vorname")} onChange={(e) => set("zahler_vorname", e.target.value)} />{gruende["zahler_vorname"] ? <span className="fehlt-grund">{gruende["zahler_vorname"]}</span> : null}</div>
                  <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" className={ff("zahler_nachname").trim()} value={txt("zahler_nachname")} onChange={(e) => set("zahler_nachname", e.target.value)} />{gruende["zahler_nachname"] ? <span className="fehlt-grund">{gruende["zahler_nachname"]}</span> : null}</div>
                  <div className="field"><label>Telefonnummer <span className="req">*</span></label><input type="tel" className={ff("zahler_telefon").trim()} value={txt("zahler_telefon")} onChange={(e) => set("zahler_telefon", e.target.value)} />{gruende["zahler_telefon"] ? <span className="fehlt-grund">{gruende["zahler_telefon"]}</span> : null}</div>
                  <div className="field"><label>Geburtsdatum <span className="opt">freiwillig</span></label><input type="date" value={txt("zahler_geburtsdatum")} onChange={(e) => set("zahler_geburtsdatum", e.target.value)} /></div>
                  <div className="field col-2"><label>Verhältnis zum Patienten <span className="opt">freiwillig</span></label><input type="text" value={txt("zahler_verhaeltnis")} onChange={(e) => set("zahler_verhaeltnis", e.target.value)} /></div>
                </div>
              </div>
            )}
            <div className="field col-2" style={{ marginTop: 6 }}>
              <label>Sind Sie selbst der Versicherungsnehmer? <span className="req">*</span></label>
              {renderYesNo("ist_vn")}
            </div>
            {data.ist_vn === "nein" && (
              <div className="followup show">
                <div className="grid">
                  <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" className={ff("vn_vorname").trim()} value={txt("vn_vorname")} onChange={(e) => set("vn_vorname", e.target.value)} />{gruende["vn_vorname"] ? <span className="fehlt-grund">{gruende["vn_vorname"]}</span> : null}</div>
                  <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" className={ff("vn_nachname").trim()} value={txt("vn_nachname")} onChange={(e) => set("vn_nachname", e.target.value)} />{gruende["vn_nachname"] ? <span className="fehlt-grund">{gruende["vn_nachname"]}</span> : null}</div>
                  <div className="field col-2"><label>Verhältnis zum Patienten <span className="opt">freiwillig</span></label><input type="text" value={txt("vn_verhaeltnis")} onChange={(e) => set("vn_verhaeltnis", e.target.value)} /></div>
                </div>
              </div>
            )}
          </section>
        );
      case "behandlung":
        return (
          <section className="step active">
            <h2>Grund Ihres Besuchs</h2>
            <p className="sub">Erzählen Sie uns kurz, worum es geht, und welche Ärzte mitbehandeln.</p>
            <div className="field col-2"><label>Grund Ihres Besuchs <span className="req">*</span></label><textarea placeholder="Was führt Sie zu uns?" className={ff("besuchsgrund").trim()} value={txt("besuchsgrund")} onChange={(e) => set("besuchsgrund", e.target.value)} />{gruende["besuchsgrund"] ? <span className="fehlt-grund">{gruende["besuchsgrund"]}</span> : null}</div>
            <div className="field col-2"><label>Behandelnder / überweisender Zahnarzt <span className="opt">freiwillig</span></label><textarea placeholder="Name und Adresse" value={txt("zahnarzt")} onChange={(e) => set("zahnarzt", e.target.value)} /></div>
            <div className="field col-2"><label>Hausarzt <span className="opt">freiwillig</span></label><textarea placeholder="Name und Adresse" value={txt("hausarzt")} onChange={(e) => set("hausarzt", e.target.value)} /></div>
          </section>
        );
      case "gesundheit":
        return (
          <section className="step active">
            <h2>Gesundheitsfragen</h2>
            <p className="sub">Bitte für jede Frage Ja oder Nein wählen. Ehrliche Angaben helfen uns, sicher und richtig zu behandeln. Bei 'Ja" erscheint manchmal ein kurzes Zusatzfeld.</p>
            <div id="medlist">
              {MEDS.map((m) => (
                <div className="qrow" key={m.key}>
                  <p className="qtext"><span className="req">*</span><span>{m.t}</span></p>
                  {m.choice ? renderPills(m.key, m.choice) : renderYesNo(m.key)}
                  {m.f && data[m.key] === "ja" && (
                    <div className="followup show"><textarea placeholder={m.f} value={txt(m.key + "_text")} onChange={(e) => set(m.key + "_text", e.target.value)} /></div>
                  )}
                </div>
              ))}
              <div className="qrow">
                <p className="qtext"><span className="req">*</span><span>Wie oft werden die Zähne geputzt?</span></p>
                {renderPills("g_zaehneputzen", ["1× täglich", "2× täglich", "3× oder öfter"])}
              </div>
            </div>
          </section>
        );
      case "einwilligungen":
        return (
          <section className="step active">
            <h2>Ihre Einwilligungen</h2>
            <p className="sub">Bitte lesen und antippen, was Sie bestätigen möchten.</p>
            <div className="callout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
              <span><b>Pflicht</b> brauchen wir für die Behandlung. <b>Freiwillig</b> können Sie offenlassen, das ist völlig in Ordnung.</span>
            </div>
            <div style={{ marginTop: 6 }}>
              {renderConsent(CONSENTS[0])}
              <div className="callout" style={{ marginTop: 11 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <span><b>Hinweis zum Datenschutz:</b> Ihre Daten verarbeiten wir auf Grundlage des Behandlungsvertrags, um Sie zu behandeln, abzurechnen und Termine mit Ihnen abzustimmen. Einzelheiten stehen in unserer Datenschutzerklärung. Dafür ist keine gesonderte Einwilligung nötig.</span>
              </div>
              {CONSENTS.slice(1).map((c) => renderConsent(c))}
            </div>
          </section>
        );
      case "abschluss":
        return (
          <section className="step active">
            <h2>Abschluss & Unterschrift</h2>
            <p className="sub">Fast geschafft. Noch zwei Kleinigkeiten und Ihre Unterschrift.</p>
            <div className="field col-2"><label>Wie sind Sie auf uns aufmerksam geworden? <span className="opt">freiwillig</span></label>{renderPills("aufmerksam_geworden", ["Google-Suche", "Empfehlung", "Überweisung Zahnarzt", "Social Media", "Sonstiges"])}</div>
            <div className="grid">
              <div className="field"><label>Datum <span className="req">*</span></label><input type="date" className={ff("abschluss_datum").trim()} value={txt("abschluss_datum")} onChange={(e) => set("abschluss_datum", e.target.value)} />{gruende["abschluss_datum"] ? <span className="fehlt-grund">{gruende["abschluss_datum"]}</span> : null}</div>
              <div className="field"><label>Ort <span className="req">*</span></label><input type="text" className={ff("abschluss_ort").trim()} value={txt("abschluss_ort")} onChange={(e) => set("abschluss_ort", e.target.value)} />{gruende["abschluss_ort"] ? <span className="fehlt-grund">{gruende["abschluss_ort"]}</span> : null}</div>
            </div>
            <div className="field col-2"><label>Unterschrift des/der Versicherten <span className="req">*</span></label><SignaturePad ref={sig1} fehlt={fehlen.includes("unterschrift_sig1")} onSign={() => setFehlen((f) => f.filter((k) => k !== "unterschrift_sig1"))} /></div>
            {data.vp2_vorhanden === "ja" && (
              <div className="field col-2"><label>Unterschrift des weiteren Erziehungsberechtigten</label><SignaturePad ref={sig2} /></div>
            )}
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="aab" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: AAB_CSS }} />

      <div className="topbar">
        <div className="brand">
          <div className="mark">S</div>
          <div className="txt"><b>KFO-Praxis Dr. Schubert</b><small>Kieferorthopädie</small></div>
        </div>
        <button className="theme-toggle" type="button" title="Hell/Dunkel" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        </button>
      </div>

      <div className="shell">
        <div className="lead">
          <div className="eyebrow">Willkommen in unserer Praxis</div>
          <h1>Anamnesebogen</h1>
          <p>Damit wir Sie bestmöglich behandeln können, brauchen wir ein paar Angaben. Nehmen Sie sich Zeit, alles wird Schritt für Schritt erklärt, und Sie können jederzeit zurückgehen.</p>
        </div>

        <div className="progress">
          {visibleSteps.map((s, i) => (
            <div key={s} className={"seg" + (done || i < pos ? " done" : i === pos ? " active" : "")} />
          ))}
        </div>
        <div className="step-meta">
          <div className="kicker">{done ? "Fertig" : STEP_TITLES[stepName]}</div>
          <div className="count">{done ? "" : "Schritt " + (pos + 1) + " von " + total}</div>
        </div>

        <div className="card">
          {done ? (
            <DoneScreen account={account} lang={lang} setLang={setLang} showPw={showPw} setShowPw={setShowPw} guideOpen={guideOpen} setGuideOpen={setGuideOpen} vorname={txt("patient_vorname")} />
          ) : (
            <>
              {fehlen.length > 0 && (
                <div className="fehlt-hinweis"><span className="pkt" />Bitte die rot markierten Felder ausfüllen oder korrigieren.</div>
              )}
              {renderStep()}
            </>
          )}
        </div>
      </div>

      {!done && (
        <div className="nav">
          <div className="inner">
            <button className="btn" type="button" onClick={goBack} disabled={pos === 0}>Zurück</button>
            <span className="plabel">{"Schritt " + (pos + 1) + " von " + total}</span>
            <button className="btn primary" type="button" onClick={goNext}>{pos === total - 1 ? "Absenden" : "Weiter"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnamneseForm;
