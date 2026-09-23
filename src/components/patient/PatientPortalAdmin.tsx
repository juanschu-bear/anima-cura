"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { patientDocumentTypeOptions } from "@/lib/patient-document-types";

interface Props {
  patientId: string;
  patientName: string;
}

interface Phase {
  id: string;
  name: string;
  beschreibung: string | null;
  status: string;
  reihenfolge: number;
  start_datum: string | null;
  end_datum: string | null;
}

interface Doc {
  id: string;
  name: string;
  typ: string;
  anzeige_typ?: string;
  file_url: string | null;
  hochgeladen_am: string;
}

const phaseStatuses = [
  { value: "ausstehend", label: "Ausstehend" },
  { value: "aktiv", label: "Aktiv" },
  { value: "abgeschlossen", label: "Abgeschlossen" },
];

const docTypes = patientDocumentTypeOptions;

export default function PatientPortalAdmin({ patientId, patientName }: Props) {
  const [portalAccess, setPortalAccess] = useState<{
    has_access: boolean;
    portal: {
      email: string;
      has_logged_in?: boolean;
      has_shareable_password?: boolean;
    } | null;
  }>({ has_access: false, portal: null });
  const [phasen, setPhasen] = useState<Phase[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviting, setInviting] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetting, setResetting] = useState(false);
  const [showResetTools, setShowResetTools] = useState(false);
  const resetSectionRef = useRef<HTMLDivElement | null>(null);

  // Phase form
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDesc, setNewPhaseDesc] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);

  // Doc form
  const [docName, setDocName] = useState("");
  const [docTyp, setDocTyp] = useState("anfangsdiagnostik");
  const [docCustomTyp, setDocCustomTyp] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docMsg, setDocMsg] = useState("");
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  function suggestedDocName(file: File | null) {
    if (!file?.name) return "";
    return file.name.replace(/\.[^.]+$/, "");
  }

  function resetDocForm() {
    setDocName("");
    setDocTyp("anfangsdiagnostik");
    setDocCustomTyp("");
    setDocFile(null);
    if (docFileInputRef.current) {
      docFileInputRef.current.value = "";
    }
  }

  const fetchData = useCallback(async () => {
    const [accessRes, phasenRes, docsRes] = await Promise.allSettled([
      fetch(`/api/patient/admin/invite?patient_id=${patientId}`),
      fetch(`/api/patient/admin/phasen?patient_id=${patientId}`),
      fetch(`/api/patient/admin/dokumente?patient_id=${patientId}`),
    ]);
    if (accessRes.status === "fulfilled" && accessRes.value.ok) setPortalAccess(await accessRes.value.json());
    if (phasenRes.status === "fulfilled" && phasenRes.value.ok) { const d = await phasenRes.value.json(); setPhasen(d.phasen || []); }
    if (docsRes.status === "fulfilled" && docsRes.value.ok) { const d = await docsRes.value.json(); setDocs(d.dokumente || []); }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async () => {
    if (!inviteEmail || !invitePassword) return;
    setInviting(true);
    setInviteMsg("");
    try {
      const res = await fetch("/api/patient/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, email: inviteEmail, password: invitePassword }),
      });
      const d = await res.json();
      if (res.ok) {
        setInviteMsg("✓ Portal-Zugang erstellt für " + inviteEmail);
        setPortalAccess({
          has_access: true,
          portal: {
            email: inviteEmail,
            has_logged_in: false,
            has_shareable_password: true,
          },
        });
        setInviteEmail("");
        setInvitePassword("");
      } else {
        setInviteMsg("✗ " + (d.error || "Fehler"));
      }
    } catch { setInviteMsg("✗ Netzwerkfehler"); }
    setInviting(false);
  };

  const handleResetPassword = async () => {
    setResetting(true);
    setResetMsg("");
    try {
      const res = await fetch("/api/patient/admin/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, ...(resetPassword.trim() ? { password: resetPassword.trim() } : {}) }),
      });
      const d = await res.json();
      if (res.ok) {
        setResetMsg(`✓ Neues Startpasswort: ${d.portal?.password}`);
        setPortalAccess((prev) => ({
          has_access: prev.has_access,
          portal: prev.portal
            ? {
                ...prev.portal,
                has_shareable_password: true,
              }
            : {
                email: d.portal?.email || "",
                has_logged_in: d.portal?.has_logged_in || false,
                has_shareable_password: true,
              },
        }));
        setResetPassword("");
      } else {
        setResetMsg("✗ " + (d.error || "Fehler"));
      }
    } catch {
      setResetMsg("✗ Netzwerkfehler");
    }
    setResetting(false);
  };

  const handleAddPhase = async () => {
    if (!newPhaseName) return;
    setAddingPhase(true);
    try {
      const nextOrder = phasen.length > 0 ? Math.max(...phasen.map(p => p.reihenfolge)) + 1 : 1;
      const res = await fetch("/api/patient/admin/phasen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, name: newPhaseName, beschreibung: newPhaseDesc || null, reihenfolge: nextOrder }),
      });
      if (res.ok) {
        const d = await res.json();
        setPhasen(prev => [...prev, d.phase]);
        setNewPhaseName("");
        setNewPhaseDesc("");
      }
    } catch { /* ignore */ }
    setAddingPhase(false);
  };

  const handlePhaseStatusChange = async (phaseId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/patient/admin/phasen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: phaseId, status: newStatus, ...(newStatus === "aktiv" ? { start_datum: new Date().toISOString().split("T")[0] } : {}), ...(newStatus === "abgeschlossen" ? { end_datum: new Date().toISOString().split("T")[0] } : {}) }),
      });
      if (res.ok) {
        const d = await res.json();
        setPhasen(prev => prev.map(p => p.id === phaseId ? d.phase : p));
      }
    } catch { /* ignore */ }
  };

  const handleUploadDoc = async () => {
    const customTyp = docCustomTyp.trim();
    const baseName = docName.trim() || suggestedDocName(docFile);
    const finalName = docTyp === "sonstiges" && customTyp
      ? (baseName ? `${customTyp} · ${baseName}` : customTyp)
      : baseName;
    if (!finalName) {
      setDocMsg("✗ Bitte Dokumentname eingeben oder eine Datei auswählen");
      return;
    }
    if (docTyp === "sonstiges" && !customTyp) {
      setDocMsg("✗ Bitte den Dokumenttyp bei Sonstiges kurz eintragen");
      return;
    }
    setUploadingDoc(true);
    setDocMsg("");
    try {
      const formData = new FormData();
      formData.append("patient_id", patientId);
      formData.append("name", finalName);
      formData.append("typ", docTyp);
      if (docFile) formData.append("file", docFile);

      const res = await fetch("/api/patient/admin/dokumente", { method: "POST", body: formData });
      if (res.ok) {
        const d = await res.json();
        setDocs(prev => [d.dokument, ...prev]);
        resetDocForm();
        setDocMsg("✓ Dokument hinzugefügt");
      } else {
        const d = await res.json();
        setDocMsg("✗ " + (d.error || "Fehler"));
      }
    } catch { setDocMsg("✗ Netzwerkfehler"); }
    setUploadingDoc(false);
  };

  if (loading) return null;

  const sectionStyle = "stat-card mt-4";
  const headingStyle = "text-[20px] font-extrabold tracking-tight text-praxis-700 mb-4";
  const inputStyle = "w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-praxis-700 outline-none focus:border-[#5d4fd8] focus:ring-1 focus:ring-[#5d4fd8]";
  const btnStyle = "rounded-lg bg-[#5d4fd8] px-4 py-2 text-sm font-bold text-white hover:bg-[#4c40be] disabled:opacity-50";
  const btnSecStyle = "rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-praxis-500 hover:bg-surface-50";
  const hasLoggedIn = Boolean(portalAccess.portal?.has_logged_in);
  const hasShareablePassword = Boolean(portalAccess.portal?.has_shareable_password);
  const portalStateKind = hasShareablePassword
    ? "shareable_starter"
    : hasLoggedIn
    ? "patient_owns_password"
    : "reset_needed";
  const portalStateTitle =
    portalStateKind === "shareable_starter"
      ? "Startpasswort liegt für die Praxis vor"
      : portalStateKind === "patient_owns_password"
      ? "Patient nutzt bereits ein eigenes Passwort"
      : "Neues Startpasswort erforderlich";
  const portalStateText =
    portalStateKind === "shareable_starter"
      ? "Die Praxis kann dem Patienten das vorhandene Startpasswort direkt mitteilen."
      : portalStateKind === "patient_owns_password"
      ? "Der Zugang funktioniert grundsätzlich. Es gibt nur kein wiederanzeigbares Praxis-Startpasswort mehr."
      : "Der Patient hat aktuell kein ausstellbares Startpasswort. Hier sollte direkt ein neues Passwort erzeugt werden.";
  const portalStateAction =
    portalStateKind === "shareable_starter"
      ? "Passwort-Hilfe öffnen"
      : portalStateKind === "patient_owns_password"
      ? "Nur bei Login-Problem zurücksetzen"
      : "Neues Startpasswort erzeugen";
  const portalStateBadgeTone =
    portalStateKind === "shareable_starter"
      ? "bg-emerald-100 text-emerald-700"
      : portalStateKind === "patient_owns_password"
      ? "bg-sky-100 text-sky-700"
      : "bg-amber-100 text-amber-700";
  const starterPasswordStatus = hasShareablePassword
    ? "Ja"
    : hasLoggedIn
    ? "Nein – Patient nutzt bereits ein eigenes Passwort"
    : "Nein";
  const starterPasswordHint = hasShareablePassword
    ? "Die Praxis kann das aktuelle Startpasswort direkt weitergeben."
    : hasLoggedIn
    ? "Es gibt ein gültiges Login-Passwort, aber kein wiederanzeigbares Praxis-Startpasswort mehr."
    : "Es ist aktuell kein ausstellbares Startpasswort hinterlegt.";
  const resetButtonLabel = hasLoggedIn ? "Passwort jetzt neu setzen" : "Neues Startpasswort";

  return (
    <div className="space-y-4 mt-6">
      <h2 className="text-[24px] font-extrabold tracking-tight text-praxis-700">Patientenportal</h2>

      {/* Portal Access */}
      <div className={sectionStyle}>
        <h3 className={headingStyle}>Portal-Zugang</h3>
        {portalAccess.has_access ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 text-sm font-bold">✓</span>
              <div>
                <p className="text-sm font-bold text-praxis-700">Zugang aktiv</p>
                <p className="text-xs text-praxis-400">{portalAccess.portal?.email}</p>
              </div>
            </div>

            <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${portalStateBadgeTone}`}>
                      {portalStateTitle}
                    </span>
                    <span className="text-xs text-praxis-400">
                      {hasLoggedIn ? "Login bereits verwendet" : "Noch kein Login erkannt"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-praxis-500">{portalStateText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetTools((prev) => !prev);
                    window.setTimeout(() => {
                      resetSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }, 0);
                  }}
                  className={btnSecStyle + " whitespace-nowrap"}
                >
                  {showResetTools ? "Passwort-Hilfe schließen" : portalStateAction}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-praxis-500">
              <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1">
                Bereits eingeloggt: <span className="font-semibold text-praxis-700">{portalAccess.portal?.has_logged_in ? "Ja" : "Nein / unbekannt"}</span>
              </span>
              <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1">
                Praxis-Startpasswort: <span className="font-semibold text-praxis-700">{starterPasswordStatus}</span>
              </span>
              {!hasShareablePassword ? (
                <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-praxis-400">
                  {starterPasswordHint}
                </span>
              ) : null}
            </div>

            {showResetTools ? (
            <div ref={resetSectionRef} className="space-y-3 rounded-lg border border-surface-200 bg-surface-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-praxis-700">Passwort-Hilfe</p>
                <button
                  type="button"
                  onClick={() => setShowResetTools(false)}
                  className="text-xs font-semibold text-praxis-400 hover:text-praxis-700"
                >
                  Schließen
                </button>
              </div>
              <p className="text-xs text-praxis-500">
                Nur nutzen, wenn der Patient wirklich nicht mehr in die App kommt.
              </p>
              {hasLoggedIn && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  Ein neues Passwort ersetzt das bisherige Passwort sofort.
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder={hasLoggedIn ? "Optional neues Passwort eingeben" : "Optional eigenes Passwort eingeben"}
                  className={inputStyle}
                />
                <button onClick={handleResetPassword} disabled={resetting} className={btnStyle}>
                  {resetting ? "Erzeuge..." : resetButtonLabel}
                </button>
              </div>
              <p className="text-[11px] leading-4 text-praxis-400">Ohne Eingabe wird automatisch ein neues Passwort erzeugt.</p>
              {resetMsg && <p className={`text-sm ${resetMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{resetMsg}</p>}
            </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-praxis-500">{patientName} hat noch keinen Portal-Zugang.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-praxis-400">E-Mail</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="patient@email.de" className={inputStyle} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-praxis-400">Passwort</label>
                <input type="text" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Mindestens 8 Zeichen" className={inputStyle} />
              </div>
            </div>
            <button onClick={handleInvite} disabled={inviting || !inviteEmail || !invitePassword} className={btnStyle}>
              {inviting ? "Wird erstellt..." : "Portal-Zugang erstellen"}
            </button>
            {inviteMsg && <p className={`text-sm ${inviteMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{inviteMsg}</p>}
          </div>
        )}
      </div>

      {/* Treatment Phases */}
      <div className={sectionStyle}>
        <h3 className={headingStyle}>Behandlungsphasen</h3>
        {phasen.length > 0 ? (
          <div className="space-y-2 mb-4">
            {phasen.map(ph => (
              <div key={ph.id} className="flex items-center justify-between rounded-lg border border-surface-200 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-praxis-700">{ph.reihenfolge}. {ph.name}</p>
                  {ph.beschreibung && <p className="text-xs text-praxis-400 mt-0.5">{ph.beschreibung}</p>}
                </div>
                <select
                  value={ph.status}
                  onChange={e => handlePhaseStatusChange(ph.id, e.target.value)}
                  className="rounded-md border border-surface-200 bg-surface-50 px-2 py-1 text-xs font-semibold text-praxis-600 outline-none"
                >
                  {phaseStatuses.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-praxis-400 mb-4">Keine Behandlungsphasen definiert.</p>
        )}
        <div className="border-t border-surface-200 pt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-praxis-400">Phase hinzufügen</p>
          <div className="flex gap-2">
            <input value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} placeholder="Name (z.B. Nivellierung)" className={inputStyle + " flex-1"} />
            <input value={newPhaseDesc} onChange={e => setNewPhaseDesc(e.target.value)} placeholder="Beschreibung (optional)" className={inputStyle + " flex-1"} />
            <button onClick={handleAddPhase} disabled={addingPhase || !newPhaseName} className={btnSecStyle}>
              {addingPhase ? "..." : "+ Hinzufügen"}
            </button>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className={sectionStyle}>
        <h3 className={headingStyle}>Dokumente für Patient</h3>
        {docs.length > 0 && (
          <div className="space-y-2 mb-4">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-surface-200 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-praxis-700">{d.name}</p>
                  <p className="text-xs text-praxis-400">{d.anzeige_typ || d.typ} · {new Date(d.hochgeladen_am).toLocaleDateString("de-DE")}</p>
                </div>
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#5d4fd8] hover:underline">
                    Öffnen ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-surface-200 pt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-praxis-400">Dokument hinzufügen</p>
          <p className="text-sm text-praxis-500">
            Nach dem Speichern erscheint das Dokument direkt im Patientenportal unter den Dokumenten des zugehörigen Patienten.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Dokumentname" className={inputStyle} />
            <select value={docTyp} onChange={e => setDocTyp(e.target.value)} className={inputStyle}>
              {docTypes.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
            </select>
            <input
              ref={docFileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={e => {
                const nextFile = e.target.files?.[0] || null;
                setDocFile(nextFile);
                setDocMsg("");
                if (nextFile && !docName.trim()) setDocName(suggestedDocName(nextFile));
              }}
              className="text-sm text-praxis-500 file:mr-2 file:rounded-md file:border-0 file:bg-[#5d4fd8] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
            />
          </div>
          {docTyp === "sonstiges" ? (
            <input
              value={docCustomTyp}
              onChange={e => {
                setDocCustomTyp(e.target.value);
                setDocMsg("");
              }}
              placeholder="Dokumenttyp eingeben, z. B. Zusatzinfo oder Diagnosebericht"
              className={inputStyle}
            />
          ) : null}
          <div className="flex items-center gap-3">
            <button onClick={handleUploadDoc} disabled={uploadingDoc || !docFile || !docTyp} className={btnStyle}>
              {uploadingDoc ? "Wird hochgeladen..." : "Dokument speichern"}
            </button>
            {!docName.trim() && docFile ? (
              <span className="text-xs text-praxis-400">Dokumentname wird automatisch aus dem Dateinamen übernommen.</span>
            ) : null}
            {docFile ? (
              <span className="text-xs text-praxis-400">Ausgewählt: {docFile.name}</span>
            ) : !docMsg.startsWith("✓") ? (
              <span className="text-xs text-red-500">Bitte zuerst eine Datei auswählen.</span>
            ) : null}
            {docMsg && <span className={`text-sm ${docMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{docMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
