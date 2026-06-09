"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";

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
.aab .plabel{font-size:12.5px;color:var(--muted);}`;

interface Props {
  patientId: string;
}

type StepName =
  | "versicherung" | "patient" | "versicherter"
  | "behandlung" | "gesundheit" | "einwilligungen" | "abschluss";

const STEPS: StepName[] = [
  "versicherung", "patient", "versicherter",
  "behandlung", "gesundheit", "einwilligungen", "abschluss",
];

const STEP_TITLES: Record<StepName, string> = {
  versicherung: "Versicherung",
  patient: "Patient",
  versicherter: "Versicherter",
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

const SignaturePad = forwardRef<HTMLCanvasElement>(function SignaturePad(_props, ref) {
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
        className="sigpad"
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

export function AnamneseForm({ patientId }: Props) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [stepName, setStepName] = useState<StepName>("versicherung");
  const [done, setDone] = useState(false);

  const sig1 = useRef<HTMLCanvasElement | null>(null);
  const sig2 = useRef<HTMLCanvasElement | null>(null);

  const set = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));
  const txt = (key: string) => (data[key] as string) ?? "";

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
    void fetch("/api/anima-sign/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, answers: payload, schema }),
    }).catch((error) => console.error("Anamnese-Übermittlung fehlgeschlagen:", error));
    setDone(true);
    scrollTop();
  };

  const goNext = () => {
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
      <div className="yn">
        <button type="button" className={v === "ja" ? "on" : ""} onClick={() => set(name, "ja")}>Ja</button>
        <button type="button" className={v === "nein" ? "on" : ""} onClick={() => set(name, "nein")}>Nein</button>
      </div>
    );
  };

  const renderPills = (name: string, options: string[]) => {
    const v = data[name];
    return (
      <div className="pills">
        {options.map((o) => (
          <button key={o} type="button" className={v === o ? "on" : ""} onClick={() => set(name, o)}>{o}</button>
        ))}
      </div>
    );
  };

  const renderConsent = (c: ConsentDef) => {
    const on = Boolean(data[c.key]);
    return (
      <div key={c.key} className={"consent" + (on ? " on" : "")} onClick={() => set(c.key, !on)}>
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
              <div className="field"><label>Krankenkasse <span className="req">*</span></label><input type="text" placeholder="z. B. AOK, TK …" value={txt("krankenkasse")} onChange={(e) => set("krankenkasse", e.target.value)} /></div>
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
              <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" value={txt("patient_vorname")} onChange={(e) => set("patient_vorname", e.target.value)} /></div>
              <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" value={txt("patient_nachname")} onChange={(e) => set("patient_nachname", e.target.value)} /></div>
              <div className="field col-2"><label>Geburtsdatum <span className="req">*</span></label><input type="date" value={txt("patient_geburtsdatum")} onChange={(e) => set("patient_geburtsdatum", e.target.value)} /><span className="hint">Daraus richten wir den Bogen automatisch passend für Sie ein.</span></div>
              <div className="field"><label>Geschlecht <span className="req">*</span></label><select value={txt("patient_geschlecht")} onChange={(e) => set("patient_geschlecht", e.target.value)}><option value="">Bitte wählen</option><option>Männlich</option><option>Weiblich</option><option>Divers</option></select></div>
              <div className="field"><label>Telefonnummer <span className="req">*</span></label><input type="tel" value={txt("patient_telefon")} onChange={(e) => set("patient_telefon", e.target.value)} /></div>
              <div className="field"><label>Straße <span className="req">*</span></label><input type="text" value={txt("patient_strasse")} onChange={(e) => set("patient_strasse", e.target.value)} /></div>
              <div className="field"><label>Hausnummer <span className="req">*</span></label><input type="text" value={txt("patient_hausnummer")} onChange={(e) => set("patient_hausnummer", e.target.value)} /></div>
              <div className="field"><label>PLZ <span className="req">*</span></label><input type="text" inputMode="numeric" value={txt("patient_plz")} onChange={(e) => set("patient_plz", e.target.value)} /></div>
              <div className="field"><label>Wohnort <span className="req">*</span></label><input type="text" value={txt("patient_wohnort")} onChange={(e) => set("patient_wohnort", e.target.value)} /></div>
              <div className="field col-2"><label>E-Mail-Adresse <span className="req">*</span></label><input type="email" value={txt("patient_email")} onChange={(e) => set("patient_email", e.target.value)} /><span className="hint">Für Terminerinnerungen und Ihre Unterlagen.</span></div>
              <div className="field"><label>Mobilnummer <span className="req">*</span></label><input type="tel" value={txt("patient_mobil")} onChange={(e) => set("patient_mobil", e.target.value)} /></div>
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
              <div className="field"><label>Vorname <span className="req">*</span></label><input type="text" value={txt("vp_vorname")} onChange={(e) => set("vp_vorname", e.target.value)} /></div>
              <div className="field"><label>Nachname <span className="req">*</span></label><input type="text" value={txt("vp_nachname")} onChange={(e) => set("vp_nachname", e.target.value)} /></div>
              <div className="field"><label>Geburtsdatum</label><input type="date" value={txt("vp_geburtsdatum")} onChange={(e) => set("vp_geburtsdatum", e.target.value)} /></div>
              <div className="field"><label>Telefonnummer <span className="req">*</span></label><input type="tel" value={txt("vp_telefon")} onChange={(e) => set("vp_telefon", e.target.value)} /></div>
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
      case "behandlung":
        return (
          <section className="step active">
            <h2>Grund Ihres Besuchs</h2>
            <p className="sub">Erzählen Sie uns kurz, worum es geht, und welche Ärzte mitbehandeln.</p>
            <div className="field col-2"><label>Grund Ihres Besuchs <span className="req">*</span></label><textarea placeholder="Was führt Sie zu uns?" value={txt("besuchsgrund")} onChange={(e) => set("besuchsgrund", e.target.value)} /></div>
            <div className="field col-2"><label>Behandelnder / überweisender Zahnarzt <span className="opt">freiwillig</span></label><textarea placeholder="Name und Adresse" value={txt("zahnarzt")} onChange={(e) => set("zahnarzt", e.target.value)} /></div>
            <div className="field col-2"><label>Hausarzt <span className="opt">freiwillig</span></label><textarea placeholder="Name und Adresse" value={txt("hausarzt")} onChange={(e) => set("hausarzt", e.target.value)} /></div>
          </section>
        );
      case "gesundheit":
        return (
          <section className="step active">
            <h2>Gesundheitsfragen</h2>
            <p className="sub">Bitte für jede Frage Ja oder Nein wählen. Ehrliche Angaben helfen uns, sicher und richtig zu behandeln. Bei „Ja" erscheint manchmal ein kurzes Zusatzfeld.</p>
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
              <div className="field"><label>Datum <span className="req">*</span></label><input type="date" value={txt("abschluss_datum")} onChange={(e) => set("abschluss_datum", e.target.value)} /></div>
              <div className="field"><label>Ort <span className="req">*</span></label><input type="text" value={txt("abschluss_ort")} onChange={(e) => set("abschluss_ort", e.target.value)} /></div>
            </div>
            <div className="field col-2"><label>Unterschrift des/der Versicherten <span className="req">*</span></label><SignaturePad ref={sig1} /></div>
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
            <div className="done-screen show">
              <div className="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
              <h2>Vielen Dank!</h2>
              <p>Ihr Bogen ist eingegangen. Sie erhalten Ihre unterschriebenen Unterlagen per E-Mail, und unsere Praxis hat alles vorliegen.</p>
              <span className="applink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>In der Anima Cura App haben Sie alles jederzeit griffbereit.</span>
            </div>
          ) : (
            renderStep()
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
