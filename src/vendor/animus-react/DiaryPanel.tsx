import type { CSSProperties, ReactElement } from "react";
import type { AnimusDiaryEntry, AnimusLearningFact, AnimusMemorySnapshot } from "./types";

type DiaryPanelProps = {
  open: boolean;
  snapshot: AnimusMemorySnapshot | null;
  onClose: () => void;
  onRefresh?: () => void;
};

const PANEL: CSSProperties = {
  position: "absolute",
  inset: "32px 32px 32px auto",
  width: "min(540px, calc(100vw - 48px))",
  maxWidth: "92vw",
  borderRadius: 24,
  background: "linear-gradient(180deg, rgba(24,20,14,.97), rgba(14,11,8,.98))",
  border: "1px solid rgba(201,177,121,.24)",
  boxShadow: "0 24px 80px rgba(0,0,0,.55)",
  color: "#efe4cc",
  backdropFilter: "blur(14px)",
  zIndex: 9,
  overflow: "hidden",
};

function formatWhen(value?: string): string {
  if (!value) return "gerade eben";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function wmField(value: unknown): string {
  if (typeof value === "string") return value.trim() || "—";
  if (value == null) return "—";
  return String(value);
}

function activePatient(snapshot: AnimusMemorySnapshot | null): string {
  const raw = snapshot?.working_memory?.active_patient;
  if (!raw || typeof raw !== "object") return "—";
  const record = raw as Record<string, unknown>;
  return wmField(record.name);
}

function activeDoku(snapshot: AnimusMemorySnapshot | null): string {
  const raw = snapshot?.working_memory?.active_doku;
  if (!raw || typeof raw !== "object") return "—";
  const record = raw as Record<string, unknown>;
  return wmField(record.vorlage_name);
}

function workingText(snapshot: AnimusMemorySnapshot | null): string {
  const raw = snapshot?.working_memory?.active_doku;
  if (!raw || typeof raw !== "object") return "Noch kein aktiver Entwurf.";
  const record = raw as Record<string, unknown>;
  const text = wmField(record.text);
  return text === "—" ? "Noch kein aktiver Entwurf." : text;
}

function MemoryFacts({ facts }: { facts: AnimusLearningFact[] }): ReactElement {
  if (!facts.length) {
    return <div style={{ opacity: 0.66 }}>Noch keine Langzeit-Facts gespeichert.</div>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {facts.map((fact) => (
        <span
          key={fact.key}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid rgba(201,177,121,.22)",
            background: "rgba(255,248,232,.04)",
            fontSize: 13,
            lineHeight: 1.3,
            color: "#f4ead8",
          }}
        >
          {fact.text}
          <span style={{ marginLeft: 8, opacity: 0.56 }}>+{fact.count}</span>
        </span>
      ))}
    </div>
  );
}

function DiaryEntries({ diary }: { diary: AnimusDiaryEntry[] }): ReactElement {
  if (!diary.length) {
    return <div style={{ opacity: 0.66 }}>Noch keine Diary-Einträge vorhanden.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {diary.map((entry, index) => (
        <article
          key={`${entry.created_at ?? "entry"}-${index}`}
          style={{
            padding: "18px 18px 16px",
            borderRadius: 18,
            border: "1px solid rgba(201,177,121,.18)",
            background: "rgba(255,248,232,.035)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase", opacity: 0.52 }}>
                {entry.reason || "Diary"}
              </div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 1.05, marginTop: 8 }}>
                {entry.patient_name || entry.title || "ANIMUS Diary"}
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.58, whiteSpace: "nowrap", paddingTop: 6 }}>
              {formatWhen(entry.created_at)}
            </div>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.8, color: "#efe1c5", fontFamily: '"Georgia", serif', fontStyle: "italic" }}>
            {entry.preview || "Kein Vorschautext vorhanden."}
          </div>
          {entry.learning_notes.length ? (
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {entry.learning_notes.map((note, noteIndex) => (
                <span
                  key={`${entry.created_at ?? "note"}-${noteIndex}`}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(201,177,121,.08)",
                    border: "1px solid rgba(201,177,121,.18)",
                    fontSize: 12,
                    color: "#e8d6b6",
                  }}
                >
                  {note}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function DiaryPanel({ open, snapshot, onClose, onRefresh }: DiaryPanelProps): ReactElement | null {
  if (!open) return null;
  const facts = snapshot?.facts ?? [];
  const diary = snapshot?.diary_entries ?? [];
  const followUp = wmField(snapshot?.working_memory?.open_follow_up);
  const correction = wmField(snapshot?.working_memory?.last_correction_hint);

  return (
    <div style={PANEL}>
      <div style={{ padding: "28px 28px 18px", borderBottom: "1px solid rgba(201,177,121,.16)" }}>
        <div style={{ fontSize: 11, letterSpacing: ".34em", textTransform: "uppercase", opacity: 0.5 }}>ANIMUS Diary</div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 44, lineHeight: 1 }}>Working Memory</div>
            <div style={{ marginTop: 10, opacity: 0.72, fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 20 }}>
              Was ANIMUS hält, was er gelernt hat, was er als Nächstes noch offen hat.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", color: "#d8c39a", border: "none", cursor: "pointer", fontSize: 26, lineHeight: 1 }}>
            ×
          </button>
        </div>
      </div>

      <div style={{ maxHeight: "calc(100vh - 160px)", overflow: "auto", padding: 28, display: "grid", gap: 26 }}>
        <section style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, letterSpacing: ".26em", textTransform: "uppercase", opacity: 0.55 }}>Live-Kontext</div>
            {onRefresh ? (
              <button
                onClick={onRefresh}
                style={{ borderRadius: 999, padding: "8px 12px", border: "1px solid rgba(201,177,121,.18)", background: "rgba(255,248,232,.03)", color: "#ead8b4", cursor: "pointer", fontSize: 12 }}
              >
                aktualisieren
              </button>
            ) : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <InfoCard label="Aktiver Patient" value={activePatient(snapshot)} />
            <InfoCard label="Aktive Doku" value={activeDoku(snapshot)} />
            <InfoCard label="Offene Rückfrage" value={followUp} />
            <InfoCard label="Letzte Korrektur" value={correction} />
          </div>
          <article style={{ borderRadius: 18, border: "1px solid rgba(201,177,121,.16)", background: "rgba(255,248,232,.035)", padding: 18 }}>
            <div style={{ fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase", opacity: 0.48, marginBottom: 10 }}>Aktueller Entwurf</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 21, lineHeight: 1.65, color: "#f4ead5" }}>{workingText(snapshot)}</div>
          </article>
        </section>

        <section style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: ".26em", textTransform: "uppercase", opacity: 0.55 }}>Learned Facts</div>
          <MemoryFacts facts={facts} />
        </section>

        <section style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: ".26em", textTransform: "uppercase", opacity: 0.55 }}>Diary</div>
          <DiaryEntries diary={diary} />
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ borderRadius: 18, border: "1px solid rgba(201,177,121,.16)", background: "rgba(255,248,232,.03)", padding: "16px 18px" }}>
      <div style={{ fontSize: 11, letterSpacing: ".24em", textTransform: "uppercase", opacity: 0.46 }}>{label}</div>
      <div style={{ marginTop: 10, fontFamily: "Georgia, serif", fontSize: 22, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}
