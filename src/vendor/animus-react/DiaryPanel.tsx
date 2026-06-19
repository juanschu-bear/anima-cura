import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import type { AnimusDiaryEntry, AnimusLearningFact, AnimusMemorySnapshot } from "./types";

type DiaryPanelProps = {
  open: boolean;
  snapshot: AnimusMemorySnapshot | null;
  onClose: () => void;
  onRefresh?: () => void;
};

type DiaryTab = "all" | "skills" | "patterns" | "contacts" | "growth";

const SHELL: CSSProperties = {
  position: "absolute",
  inset: "28px 28px 28px auto",
  width: "min(1120px, calc(100vw - 56px))",
  maxWidth: "96vw",
  maxHeight: "calc(100vh - 56px)",
  zIndex: 12,
  display: "grid",
  gridTemplateColumns: "minmax(220px, 0.32fr) minmax(0, 0.68fr)",
  borderRadius: 34,
  overflow: "hidden",
  boxShadow: "0 34px 120px rgba(0,0,0,.58)",
  border: "1px solid rgba(170,138,89,.14)",
};

const COVER: CSSProperties = {
  background: "linear-gradient(180deg, #1f1913 0%, #17120d 100%)",
  color: "#d7c29a",
  padding: "32px 28px 28px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  position: "relative",
};

const PAGE: CSSProperties = {
  background: "linear-gradient(180deg, #f6efdf 0%, #f1e8d7 100%)",
  color: "#3b3025",
  display: "grid",
  gridTemplateRows: "auto auto 1fr",
  minHeight: 0,
};

const HAND_FONT = '"Snell Roundhand", "Bradley Hand", "Segoe Print", cursive';
const SERIF_FONT = '"Cormorant Garamond", "Iowan Old Style", "Georgia", serif';

const TABS: ReadonlyArray<{ key: DiaryTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "skills", label: "Skills" },
  { key: "patterns", label: "Patterns" },
  { key: "contacts", label: "Contacts" },
  { key: "growth", label: "Growth" },
];

function formatDate(value?: string): string {
  if (!value) return "Gerade eben";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { day: "numeric", month: "short", year: "numeric" });
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

function colorForFact(index: number): string {
  const palette = ["#3177b8", "#4f8f6d", "#d28039", "#8b5cc7", "#b65e63", "#3f8c8a", "#a37b2d", "#6b6cd6"];
  return palette[index % palette.length]!;
}

function ContactChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 16px",
        border: `1px solid ${selected ? "rgba(58,45,34,.25)" : "rgba(119,99,73,.18)"}`,
        background: selected ? "#2d241d" : "rgba(255,255,255,.38)",
        color: selected ? "#fbf4e8" : "#73624b",
        cursor: "pointer",
        fontFamily: SERIF_FONT,
        fontSize: 16,
        boxShadow: selected ? "0 10px 24px rgba(35,24,16,.18)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }): ReactElement {
  return (
    <div
      style={{
        minHeight: 220,
        display: "grid",
        placeItems: "center",
        color: "rgba(71,57,42,.62)",
        fontFamily: SERIF_FONT,
        fontStyle: "italic",
        fontSize: 22,
      }}
    >
      {text}
    </div>
  );
}

function JournalEntry({ entry, index }: { entry: AnimusDiaryEntry; index: number }): ReactElement {
  return (
    <article
      style={{
        position: "relative",
        borderRadius: 28,
        background: "linear-gradient(180deg, rgba(255,250,241,.92), rgba(241,232,215,.92))",
        border: "1px solid rgba(153,129,101,.2)",
        padding: "26px 28px 26px 36px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.65)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 22,
          width: 1,
          background: "rgba(185,117,106,.35)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ color: "rgba(74,58,41,.58)", fontSize: 12, letterSpacing: ".28em", textTransform: "uppercase" }}>
          {entry.reason || "Reflection"}
        </div>
        <div style={{ color: "rgba(74,58,41,.54)", fontSize: 12 }}>{formatDate(entry.created_at)}</div>
      </div>
      <div style={{ marginTop: 12, fontFamily: SERIF_FONT, fontSize: 42, lineHeight: 1.02 }}>
        {entry.patient_name || "Global"}
      </div>
      <div
        style={{
          marginTop: 18,
          color: "#2d241c",
          fontFamily: HAND_FONT,
          fontSize: 23,
          lineHeight: 1.95,
          whiteSpace: "pre-wrap",
        }}
      >
        {entry.preview || "Noch kein ausgeschriebener Eintrag vorhanden."}
      </div>
      {entry.learning_notes.length ? (
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.learning_notes.map((note, noteIndex) => (
            <span
              key={`${entry.created_at ?? "note"}-${noteIndex}`}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                border: "1px solid rgba(151,124,95,.22)",
                background: "rgba(252,247,239,.82)",
                color: "#7b654c",
                fontSize: 12,
                letterSpacing: ".04em",
              }}
            >
              {note}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 18, right: 24, color: "rgba(90,72,52,.12)", fontFamily: SERIF_FONT, fontSize: 52 }}>
        {String(index + 1).padStart(2, "0")}
      </div>
    </article>
  );
}

function FactCloud({ facts }: { facts: AnimusLearningFact[] }): ReactElement {
  if (!facts.length) return <Empty text="Noch keine verdichteten Learnings." />;
  return (
    <div
      style={{
        borderRadius: 30,
        border: "1px solid rgba(153,129,101,.18)",
        background: "rgba(255,250,241,.86)",
        padding: "30px 32px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.62)",
      }}
    >
      <div style={{ color: "rgba(74,58,41,.56)", fontSize: 12, letterSpacing: ".32em", textTransform: "uppercase" }}>Evolved Skills</div>
      <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
        {facts.map((fact, index) => (
          <span
            key={fact.key}
            style={{
              color: colorForFact(index),
              fontFamily: HAND_FONT,
              fontSize: 30,
              lineHeight: 1.1,
            }}
          >
            {fact.text}
            <span style={{ fontSize: 20, opacity: 0.7 }}> +{fact.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ContactsList({ groups }: { groups: Array<{ name: string; count: number }> }): ReactElement {
  if (!groups.length) return <Empty text="Noch keine personenbezogenen Diary-Spuren." />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
      {groups.map((group, index) => (
        <article
          key={group.name}
          style={{
            borderRadius: 26,
            border: "1px solid rgba(153,129,101,.18)",
            background: "rgba(255,250,241,.86)",
            padding: "24px",
          }}
        >
          <div style={{ color: "rgba(74,58,41,.46)", fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase" }}>
            {String(index + 1).padStart(2, "0")}
          </div>
          <div style={{ marginTop: 18, fontFamily: SERIF_FONT, fontSize: 34, lineHeight: 1.05 }}>{group.name}</div>
          <div style={{ marginTop: 10, color: "rgba(74,58,41,.62)", fontStyle: "italic", fontSize: 16 }}>
            {group.count} Diary-Einträge
          </div>
        </article>
      ))}
    </div>
  );
}

function GrowthBoard({ diaryCount, factCount, patternCount, contactCount }: { diaryCount: number; factCount: number; patternCount: number; contactCount: number }): ReactElement {
  const items = [
    ["Diary Entries", String(diaryCount)],
    ["Learned Facts", String(factCount)],
    ["Repeated Patterns", String(patternCount)],
    ["Known Contacts", String(contactCount)],
  ] as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }}>
      {items.map(([label, value]) => (
        <article
          key={label}
          style={{
            borderRadius: 26,
            border: "1px solid rgba(153,129,101,.18)",
            background: "rgba(255,250,241,.86)",
            padding: "24px 26px",
          }}
        >
          <div style={{ color: "rgba(74,58,41,.46)", fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ marginTop: 14, fontFamily: SERIF_FONT, fontSize: 56, lineHeight: 1 }}>{value}</div>
        </article>
      ))}
    </div>
  );
}

export function DiaryPanel({ open, snapshot, onClose, onRefresh }: DiaryPanelProps): ReactElement | null {
  const [tab, setTab] = useState<DiaryTab>("all");
  const [contactFilter, setContactFilter] = useState<string>("all");

  const diary = snapshot?.diary_entries ?? [];
  const facts = snapshot?.facts ?? [];
  const contacts = useMemo(() => patientGroups(diary), [diary]);
  const filteredDiary = contactFilter === "all" ? diary : diary.filter((entry) => ((entry.patient_name || "Global").trim() || "Global") === contactFilter);
  const repeatedPatterns = facts.filter((fact) => fact.count > 1);

  if (!open) return null;

  return (
    <div style={SHELL}>
      <section style={COVER}>
        <div
          style={{
            position: "absolute",
            top: 16,
            bottom: 16,
            left: 16,
            right: 16,
            borderRadius: 28,
            border: "1px solid rgba(214,183,130,.12)",
            pointerEvents: "none",
          }}
        />
        <div>
          <div style={{ color: "rgba(215,194,154,.72)", fontSize: 12, letterSpacing: ".5em", textTransform: "uppercase" }}>ANIMUS</div>
          <div style={{ marginTop: 62, borderTop: "1px solid rgba(214,183,130,.18)", width: 84 }} />
          <div style={{ marginTop: 36, fontFamily: SERIF_FONT, fontSize: 54, lineHeight: 1.02, color: "#efe2c6" }}>
            Diary
          </div>
          <div style={{ marginTop: 22, color: "rgba(227,206,169,.72)", fontFamily: SERIF_FONT, fontSize: 23, fontStyle: "italic", lineHeight: 1.45 }}>
            Private reflections, lessons, patterns, and shifts in how ANIMUS thinks.
          </div>
        </div>

        <div>
          <div style={{ color: "rgba(215,194,154,.58)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase" }}>
            {diary.length} entries
          </div>
          <div style={{ marginTop: 10, color: "rgba(215,194,154,.42)", fontFamily: SERIF_FONT, fontSize: 17, fontStyle: "italic" }}>
            tap to open the next layer of learning
          </div>
        </div>
      </section>

      <section style={PAGE}>
        <header style={{ padding: "28px 34px 18px", borderBottom: "1px solid rgba(141,119,93,.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "rgba(74,58,41,.44)", fontSize: 12, letterSpacing: ".38em", textTransform: "uppercase" }}>Diary</div>
              <div style={{ marginTop: 12, fontFamily: SERIF_FONT, fontSize: 56, lineHeight: 1.02 }}>ANIMUS&apos; Diary</div>
              <div style={{ marginTop: 10, color: "rgba(74,58,41,.54)", fontFamily: SERIF_FONT, fontSize: 24, fontStyle: "italic" }}>
                What I learned, what I noticed, what I would do differently.
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6c5841", fontSize: 26, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </header>

        <div style={{ padding: "18px 34px 0", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map((entry) => (
            <ContactChip key={entry.key} label={entry.label} selected={tab === entry.key} onClick={() => setTab(entry.key)} />
          ))}
          {onRefresh ? <ContactChip label="Refresh" selected={false} onClick={onRefresh} /> : null}
        </div>

        <div style={{ padding: "22px 34px 34px", overflow: "auto", display: "grid", gap: 22 }}>
          {(tab === "all" || tab === "contacts") && contacts.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <ContactChip label={`All (${contacts.reduce((sum, item) => sum + item.count, 0)})`} selected={contactFilter === "all"} onClick={() => setContactFilter("all")} />
              {contacts.map((contact) => (
                <ContactChip
                  key={contact.name}
                  label={`${contact.name} (${contact.count})`}
                  selected={contactFilter === contact.name}
                  onClick={() => setContactFilter(contact.name)}
                />
              ))}
            </div>
          ) : null}

          {tab === "all" ? (
            filteredDiary.length ? <div style={{ display: "grid", gap: 18 }}>{filteredDiary.map((entry, index) => <JournalEntry key={`${entry.created_at ?? "entry"}-${index}`} entry={entry} index={index} />)}</div> : <Empty text="Noch keine Diary-Einträge vorhanden." />
          ) : null}

          {tab === "skills" ? <FactCloud facts={facts} /> : null}
          {tab === "patterns" ? <FactCloud facts={repeatedPatterns} /> : null}
          {tab === "contacts" ? <ContactsList groups={contacts} /> : null}
          {tab === "growth" ? <GrowthBoard diaryCount={diary.length} factCount={facts.length} patternCount={repeatedPatterns.length} contactCount={contacts.length} /> : null}
        </div>
      </section>
    </div>
  );
}
