import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import type { AnimusDiaryEntry, AnimusLearningFact, AnimusMemorySnapshot } from "./types";

type DiaryPanelProps = {
  open: boolean;
  snapshot: AnimusMemorySnapshot | null;
  onClose: () => void;
  onRefresh?: () => void;
};

type DiaryTab = "all" | "skills" | "patterns" | "contacts" | "growth";

const PANEL: CSSProperties = {
  position: "absolute",
  inset: "28px 28px 28px auto",
  width: "min(760px, calc(100vw - 56px))",
  maxWidth: "94vw",
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(27,21,15,.98), rgba(16,12,9,.99))",
  border: "1px solid rgba(198,171,117,.18)",
  boxShadow: "0 30px 100px rgba(0,0,0,.58)",
  color: "#efe4cf",
  backdropFilter: "blur(16px)",
  zIndex: 12,
  overflow: "hidden",
};

const TABS: ReadonlyArray<{ key: DiaryTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "skills", label: "Skills" },
  { key: "patterns", label: "Patterns" },
  { key: "contacts", label: "Contacts" },
  { key: "growth", label: "Growth" },
];

function formatWhen(value?: string): string {
  if (!value) return "gerade eben";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function colorForFact(index: number): string {
  const palette = [
    "#8ec5ff",
    "#9fe6c4",
    "#f3bf7d",
    "#dba4ff",
    "#ffad8f",
    "#8dd0bf",
    "#ffd88b",
    "#b7a7ff",
    "#7edbd2",
    "#ff97bb",
  ];
  return palette[index % palette.length]!;
}

function patientGroups(entries: AnimusDiaryEntry[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const name = (entry.patient_name || "Global").trim() || "Global";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
}

function PatternEntries({ entries }: { entries: AnimusLearningFact[] }): ReactElement {
  if (!entries.length) return <Empty text="Noch keine wiederkehrenden Muster erkannt." />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {entries.map((fact, index) => (
        <article
          key={fact.key}
          style={{
            borderRadius: 20,
            border: "1px solid rgba(198,171,117,.15)",
            background: "rgba(255,248,232,.03)",
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 1.1, color: colorForFact(index) }}>
              {fact.text}
            </div>
            <div style={{ fontSize: 12, opacity: 0.58, whiteSpace: "nowrap" }}>+{fact.count}</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.58 }}>
            Kategorie: {fact.category || "learning"} · zuletzt gesehen {formatWhen(fact.last_seen)}
          </div>
        </article>
      ))}
    </div>
  );
}

function EntryList({ diary }: { diary: AnimusDiaryEntry[] }): ReactElement {
  if (!diary.length) return <Empty text="Noch keine Diary-Einträge vorhanden." />;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {diary.map((entry, index) => (
        <article
          key={`${entry.created_at ?? "entry"}-${index}`}
          style={{
            padding: "22px 22px 18px",
            borderRadius: 22,
            border: "1px solid rgba(198,171,117,.16)",
            background: "rgba(255,248,232,.035)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".26em", textTransform: "uppercase", opacity: 0.46 }}>
                {entry.reason || "Diary"}
              </div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.05, marginTop: 10 }}>
                {entry.patient_name || "Global"}
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.56, whiteSpace: "nowrap", paddingTop: 6 }}>{formatWhen(entry.created_at)}</div>
          </div>
          <div style={{ fontFamily: '"Georgia", serif', fontSize: 21, lineHeight: 1.75, fontStyle: "italic", color: "#efe1c5" }}>
            {entry.preview || "Kein Vorschautext vorhanden."}
          </div>
          {entry.learning_notes.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              {entry.learning_notes.map((note, noteIndex) => (
                <span
                  key={`${entry.created_at ?? "note"}-${noteIndex}`}
                  style={{
                    padding: "7px 11px",
                    borderRadius: 999,
                    background: "rgba(198,171,117,.08)",
                    border: "1px solid rgba(198,171,117,.14)",
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

function ContactsGrid({ groups, selected, onSelect }: { groups: Array<{ name: string; count: number }>; selected: string; onSelect: (name: string) => void }): ReactElement {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <ContactChip selected={selected === "all"} label={`All (${groups.reduce((sum, group) => sum + group.count, 0)})`} onClick={() => onSelect("all")} />
      {groups.map((group) => (
        <ContactChip key={group.name} selected={selected === group.name} label={`${group.name} (${group.count})`} onClick={() => onSelect(group.name)} />
      ))}
    </div>
  );
}

function ContactChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "11px 16px",
        border: `1px solid ${selected ? "rgba(32,26,20,.28)" : "rgba(198,171,117,.18)"}`,
        background: selected ? "#2a241f" : "rgba(255,248,232,.03)",
        color: selected ? "#f5eee1" : "#bfae8f",
        cursor: "pointer",
        fontFamily: '"Georgia", serif',
        fontSize: 16,
      }}
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }): ReactElement {
  return <div style={{ opacity: 0.66, fontStyle: "italic", fontFamily: '"Georgia", serif', fontSize: 20 }}>{text}</div>;
}

export function DiaryPanel({ open, snapshot, onClose, onRefresh }: DiaryPanelProps): ReactElement | null {
  const [tab, setTab] = useState<DiaryTab>("all");
  const [contactFilter, setContactFilter] = useState<string>("all");
  const diary = snapshot?.diary_entries ?? [];
  const facts = snapshot?.facts ?? [];
  const contacts = useMemo(() => patientGroups(diary), [diary]);
  const filteredDiary = contactFilter === "all" ? diary : diary.filter((entry) => (entry.patient_name || "Global").trim() === contactFilter);
  const repeatedPatterns = facts.filter((fact) => fact.count > 1);

  if (!open) return null;

  return (
    <div style={PANEL}>
      <div style={{ padding: "28px 28px 22px", borderBottom: "1px solid rgba(198,171,117,.14)" }}>
        <div style={{ fontSize: 11, letterSpacing: ".34em", textTransform: "uppercase", opacity: 0.5 }}>Diary</div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: '"Georgia", serif', fontSize: 48, lineHeight: 1.02 }}>ANIMUS Diary</div>
            <div style={{ marginTop: 12, opacity: 0.72, fontStyle: "italic", fontFamily: '"Georgia", serif', fontSize: 22 }}>
              Private reflections, lessons, patterns, and shifts in how ANIMUS thinks.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", color: "#d8c39a", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1 }}>
            ×
          </button>
        </div>
      </div>

      <div style={{ maxHeight: "calc(100vh - 168px)", overflow: "auto", padding: 28, display: "grid", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TABS.map((entry) => (
              <ContactChip key={entry.key} label={entry.label} selected={tab === entry.key} onClick={() => setTab(entry.key)} />
            ))}
          </div>
          {onRefresh ? (
            <button
              onClick={onRefresh}
              style={{
                borderRadius: 999,
                padding: "10px 14px",
                border: "1px solid rgba(198,171,117,.18)",
                background: "rgba(255,248,232,.03)",
                color: "#ead8b4",
                cursor: "pointer",
                fontSize: 12,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              refresh
            </button>
          ) : null}
        </div>

        {(tab === "all" || tab === "contacts") && contacts.length > 0 ? (
          <ContactsGrid groups={contacts} selected={contactFilter} onSelect={setContactFilter} />
        ) : null}

        {tab === "all" ? <EntryList diary={filteredDiary} /> : null}

        {tab === "skills" ? <PatternEntries entries={facts} /> : null}

        {tab === "patterns" ? <PatternEntries entries={repeatedPatterns} /> : null}

        {tab === "contacts" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {contacts.length ? (
              contacts.map((contact, index) => (
                <article
                  key={contact.name}
                  style={{
                    borderRadius: 22,
                    border: "1px solid rgba(198,171,117,.16)",
                    background: "rgba(255,248,232,.035)",
                    padding: "20px 22px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontFamily: '"Georgia", serif', fontSize: 34, color: colorForFact(index) }}>{contact.name}</div>
                    <div style={{ opacity: 0.58 }}>{contact.count} Einträge</div>
                  </div>
                </article>
              ))
            ) : (
              <Empty text="Noch keine personenbezogenen Diary-Einträge vorhanden." />
            )}
          </div>
        ) : null}

        {tab === "growth" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <GrowthCard label="Diary Entries" value={String(diary.length)} />
            <GrowthCard label="Learned Facts" value={String(facts.length)} />
            <GrowthCard label="Repeated Patterns" value={String(repeatedPatterns.length)} />
            <GrowthCard label="Known Contacts" value={String(contacts.length)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GrowthCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ borderRadius: 22, border: "1px solid rgba(198,171,117,.16)", background: "rgba(255,248,232,.035)", padding: "22px 24px" }}>
      <div style={{ fontSize: 11, letterSpacing: ".24em", textTransform: "uppercase", opacity: 0.44 }}>{label}</div>
      <div style={{ marginTop: 12, fontFamily: '"Georgia", serif', fontSize: 44, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
