"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

type Progress = { prepared: boolean; paused?: boolean; contentChanged?: boolean; testAccepted: boolean; total: number; accepted: number; held: number; pending: number; dispatchFailed?: boolean };
type Preview = Progress & { eligible: number; patients: number; heldAddresses: number; subject: string; text: string };
const endpoint = "/api/anima-sign/test-email";

export function PortalInvitationCampaign({ locale }: { locale: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const label = (key: string, values: Record<string, number> = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)), t(key, locale));
  async function request(action?: string) {
    const response = await fetch(endpoint, action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : { cache: "no-store" });
    if (!response.ok) throw new Error("Campaign request failed");
    return response.json();
  }
  async function run(action: "preview" | "test" | "send") {
    setBusy(true); setError(false); stop.current = false;
    try {
      if (action === "preview") {
        const result: Preview = await request(); setPreview(result); setProgress(result);
      } else if (action === "test") {
        const result: Progress = await request("test"); setProgress(result);
        if (!result.testAccepted) throw new Error("Test not accepted");
      } else {
        setSending(true);
        let result: Progress = await request("prepare"); setProgress(result);
        while (result.pending > 0 && !stop.current) {
          result = await request("send"); setProgress(result);
          if (result.dispatchFailed) throw new Error("Batch stopped");
          if (result.paused || result.contentChanged) break;
        }
      }
    } catch { setError(true); }
    finally { setBusy(false); setSending(false); }
  }
  return <section className="invitation-campaign" aria-labelledby="invitation-title">
    <h2 id="invitation-title">{t("campaign.title", locale)}</h2>
    <p>{t("campaign.hint", locale)}</p>
    <div className="invitation-actions">
      <button disabled={busy} onClick={() => void run("preview")}>{t("campaign.preview", locale)}</button>
      {preview && <button disabled={busy} onClick={() => void run("test")}>{t("campaign.test", locale)}</button>}
      {preview && <button className="invitation-send" disabled={busy || !progress?.testAccepted || progress.paused || progress.contentChanged || (progress.prepared && progress.pending === 0)} onClick={() => void run("send")}>{t("campaign.send", locale)}</button>}
      {sending && <button onClick={() => { stop.current = true; void request("pause").then(setProgress).catch(() => setError(true)); }}>{t("campaign.pause", locale)}</button>}
    </div>
    {preview && <>
      <p>{label("campaign.counts", { eligible: preview.eligible, patients: preview.patients, held: preview.heldAddresses })}</p>
      <details><summary>{preview.subject}</summary><p className="invitation-copy">{preview.text}</p></details>
    </>}
    <div role="status" aria-live="polite">
      {(progress?.paused || progress?.contentChanged) && <p>{t("campaign.paused", locale)}</p>}
      {busy && !sending && <p>{t("campaign.busy", locale)}</p>}
      {progress?.testAccepted && <p>{t("campaign.testAccepted", locale)}</p>}
      {progress?.prepared && <p>{label("campaign.status", { accepted: progress.accepted, held: progress.held, pending: progress.pending })}</p>}
    </div>
    {error && <p role="alert">{t("campaign.error", locale)}</p>}
    <style jsx>{`
      .invitation-campaign { position: relative; margin: 0 0 24px; padding: 24px; border: 1px solid var(--border-color, #394251); border-radius: 16px; background: var(--bg-card, #141923); color: var(--text-primary, #eef2f8); font-size: 16px; line-height: 1.6; }
      h2 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
      p { margin: 8px 0; }
      .invitation-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
      button { min-height: 44px; padding: 10px 16px; border: 1px solid #778399; border-radius: 8px; background: transparent; color: inherit; font-size: 16px; cursor: pointer; }
      button.invitation-send { background: #5140bb; color: #fff; border-color: #9183ee; }
      button:disabled { opacity: .5; cursor: not-allowed; }
      button:focus-visible, summary:focus-visible { outline: 3px solid #a8bcff; outline-offset: 3px; }
      summary { cursor: pointer; padding: 8px 0; font-weight: 600; }
      .invitation-copy { white-space: pre-wrap; overflow-wrap: anywhere; }
      [role="alert"] { color: #ffb4b4; }
      @media (max-width: 600px) { .invitation-campaign { padding: 16px; } button { width: 100%; } }
    `}</style>
  </section>;
}
