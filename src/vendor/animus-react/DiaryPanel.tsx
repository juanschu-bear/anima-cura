import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import type { AnimusDiaryEntry, AnimusLearningFact, AnimusMemorySnapshot } from "./types";

type DiaryPanelProps = {
  open: boolean;
  snapshot: AnimusMemorySnapshot | null;
  onClose: () => void;
  onRefresh?: () => void;
};

type DiaryTab = "all" | "skills" | "patterns" | "contacts" | "growth";
type DiaryStage = "cover" | "opening" | "open";

const SHELL: CSSProperties = {
  position: "absolute",
  inset: "18px",
  width: "calc(100vw - 36px)",
  maxWidth: "calc(100vw - 36px)",
  height: "calc(100vh - 36px)",
  maxHeight: "calc(100vh - 36px)",
  zIndex: 12,
  display: "grid",
  gridTemplateColumns: "minmax(250px, 300px) minmax(0, 1fr)",
  borderRadius: 30,
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
  display: "block",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
};

const HAND_FONT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const SERIF_FONT = '"Cormorant Garamond", "Iowan Old Style", "Georgia", serif';
const DIARY_COVER = "/animus-diary/cover.png";
const DIARY_OPENING = "/animus-diary/opening.png";
const DIARY_OPEN = "/animus-diary/open.png";

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
  return date.toLocaleString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

function patientGroups(entries: AnimusDiaryEntry[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const name = (entry.contact || "").trim() || "Private Session";
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

function humanTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function looksTechnicalLabel(value?: string): boolean {
  const text = String(value || "").trim();
  if (!text) return true;
  const normalized = text.toLowerCase();
  if (normalized.includes("voice_confirmed") || normalized.includes("working") || normalized.includes("patient") || normalized.includes("juan-manuel")) return true;
  return /^[a-z0-9_-]+$/i.test(text);
}

function displayEntryTitle(entry: AnimusDiaryEntry): string {
  const raw = String(entry.title || "").trim();
  if (!raw || looksTechnicalLabel(raw)) return "Private Reflection";
  return raw;
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
  const title = displayEntryTitle(entry);
  return (
    <article
      style={{
        position: "relative",
        borderRadius: 34,
        background: "linear-gradient(180deg, rgba(255,251,244,.97), rgba(243,235,221,.94))",
        border: "1px solid rgba(153,129,101,.18)",
        padding: "36px 54px 48px 74px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.65), 0 12px 30px rgba(78,60,42,.05)",
        maxWidth: 980,
        width: "100%",
        justifySelf: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 44,
          width: 2,
          background: "rgba(185,117,106,.22)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "rgba(93,76,55,.42)", fontSize: 12, letterSpacing: ".22em", textTransform: "uppercase" }}>
            {entry.contact || "Diary"}
          </div>
          <div style={{ marginTop: 14, fontFamily: HAND_FONT, fontSize: 34, lineHeight: 1.08, color: "#2d241c", fontWeight: 600 }}>
            {title}
          </div>
        </div>
        <div style={{ textAlign: "right", color: "rgba(74,58,41,.48)", fontSize: 13, whiteSpace: "nowrap" }}>
          <div>{formatDate(entry.created_at)}</div>
          <div style={{ marginTop: 6 }}>{humanTime(entry.created_at)}</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 26,
          color: "#2d241c",
          fontFamily: HAND_FONT,
          fontSize: 18,
          lineHeight: 2.05,
          letterSpacing: ".01em",
          whiteSpace: "pre-wrap",
        }}
      >
        {entry.body || entry.preview || "Noch kein ausgeschriebener Eintrag vorhanden."}
      </div>
      {(entry.skills?.length || entry.patterns?.length || entry.growth?.length || entry.learning_notes.length) ? (
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(entry.skills || []).map((note, noteIndex) => (
            <span
              key={`${entry.created_at ?? "skill"}-${noteIndex}`}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                border: "1px solid rgba(109,142,182,.28)",
                background: "rgba(242,248,255,.74)",
                color: "#476b94",
                fontSize: 12,
                letterSpacing: ".04em",
              }}
            >
              {note}
            </span>
          ))}
          {(entry.patterns || []).map((note, noteIndex) => (
            <span
              key={`${entry.created_at ?? "pattern"}-${noteIndex}`}
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
          {(entry.growth || []).map((note, noteIndex) => (
            <span
              key={`${entry.created_at ?? "growth"}-${noteIndex}`}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                border: "1px solid rgba(124,162,104,.24)",
                background: "rgba(243,252,240,.78)",
                color: "#557a4f",
                fontSize: 12,
                letterSpacing: ".04em",
              }}
            >
              {note}
            </span>
          ))}
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
      <div style={{ position: "absolute", top: 28, right: 30, color: "rgba(90,72,52,.08)", fontFamily: SERIF_FONT, fontSize: 56 }}>
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
        padding: "34px 38px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.62)",
        maxWidth: 980,
        width: "100%",
        justifySelf: "center",
      }}
    >
      <div style={{ color: "rgba(74,58,41,.56)", fontSize: 12, letterSpacing: ".32em", textTransform: "uppercase" }}>Evolved Skills</div>
      <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
        {facts.map((fact, index) => (
          <span
            key={fact.key}
            style={{
              color: colorForFact(index),
              fontFamily: SERIF_FONT,
              fontSize: 24,
              lineHeight: 1.2,
            }}
          >
            {fact.text}
            <span style={{ fontSize: 16, opacity: 0.7 }}> +{fact.count}</span>
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
  const [stage, setStage] = useState<DiaryStage>("cover");

  const diary = snapshot?.diary_entries ?? [];
  const facts = snapshot?.facts ?? [];
  const contacts = useMemo(() => patientGroups(diary), [diary]);
  const filteredDiary = contactFilter === "all" ? diary : diary.filter((entry) => (((entry.contact || "").trim() || "Private Session")) === contactFilter);
  const repeatedPatterns = facts.filter((fact) => fact.count > 1);

  useEffect(() => {
    if (!open) {
      setStage("cover");
      return;
    }
    setStage("cover");
  }, [open]);

  useEffect(() => {
    if (stage !== "opening") return;
    const id = window.setTimeout(() => setStage("open"), 650);
    return () => window.clearTimeout(id);
  }, [stage]);

  if (!open) return null;

  if (stage !== "open") {
    const image = stage === "opening" ? DIARY_OPENING : DIARY_COVER;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 14,
          background: "radial-gradient(circle at 50% 40%, rgba(75,132,181,.16), rgba(4,8,16,.82) 46%, rgba(2,4,10,.96) 100%)",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "rgba(225,235,247,.78)",
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <div style={{ textAlign: "center", maxWidth: 1120 }}>
          <div style={{ color: "rgba(182,204,224,.54)", fontSize: 12, letterSpacing: ".42em", textTransform: "uppercase", marginBottom: 24 }}>
            Diary Archive
          </div>
          <button
            onClick={() => setStage("opening")}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              transform: stage === "opening" ? "scale(1.08) translateY(-12px)" : "scale(1)",
              transition: "transform 620ms cubic-bezier(.22,1,.36,1), opacity 320ms ease",
              opacity: stage === "opening" ? 0.96 : 1,
            }}
          >
            <img
              src={image}
              alt="ANIMUS Diary Buch"
              style={{
                width: "min(980px, 88vw)",
                maxHeight: "68vh",
                objectFit: "contain",
                filter: stage === "opening" ? "drop-shadow(0 28px 90px rgba(0,0,0,.58)) brightness(1.04)" : "drop-shadow(0 26px 72px rgba(0,0,0,.52))",
                borderRadius: 22,
              }}
            />
          </button>
          <div style={{ marginTop: 26, fontFamily: SERIF_FONT, fontSize: 42, lineHeight: 1.08, color: "#edf4fb" }}>
            ANIMUS&apos; Diary
          </div>
          <div style={{ marginTop: 12, color: "rgba(205,221,237,.76)", fontFamily: SERIF_FONT, fontStyle: "italic", fontSize: 24 }}>
            {stage === "opening" ? "opening the reflection archive ..." : "tap the book to open the reflection archive"}
          </div>
        </div>
      </div>
    );
  }

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
        <header style={{ padding: "26px 36px 18px", borderBottom: "1px solid rgba(141,119,93,.16)" }}>
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
          <div
            style={{
              marginTop: 24,
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(141,119,93,.18)",
              boxShadow: "0 14px 40px rgba(60,46,28,.12)",
            }}
          >
            <img
              src={DIARY_OPEN}
              alt="Geoeffnetes ANIMUS Diary"
              style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover", objectPosition: "center 56%" }}
            />
          </div>
        </header>

        <div
          style={{
            padding: "16px 36px 16px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            borderBottom: "1px solid rgba(141,119,93,.12)",
            background: "linear-gradient(180deg, rgba(246,239,223,.98), rgba(241,232,215,.94))",
          }}
        >
          {TABS.map((entry) => (
            <ContactChip key={entry.key} label={entry.label} selected={tab === entry.key} onClick={() => setTab(entry.key)} />
          ))}
          {onRefresh ? <ContactChip label="Refresh" selected={false} onClick={onRefresh} /> : null}
        </div>

        <div style={{ padding: "26px 36px 40px", display: "grid", gap: 24, alignContent: "start" }}>
          {(tab === "all" || tab === "contacts") && contacts.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxWidth: 980, width: "100%", justifySelf: "center" }}>
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
            filteredDiary.length ? <div style={{ display: "grid", gap: 22 }}>{filteredDiary.map((entry, index) => <JournalEntry key={`${entry.created_at ?? "entry"}-${index}`} entry={entry} index={index} />)}</div> : <Empty text="Noch keine Diary-Einträge vorhanden." />
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
