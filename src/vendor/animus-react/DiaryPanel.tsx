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
type DiaryFacetKey = "skills" | "patterns" | "growth" | "contacts";

type AggregatedFacet = {
  key: string;
  label: string;
  count: number;
  entryKeys: string[];
};

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

const HAND_FONT = '"Noteworthy", "Segoe Print", "Bradley Hand", "Caveat", cursive';
const SERIF_FONT = '"Cormorant Garamond", "Iowan Old Style", "Georgia", serif';
const DIARY_COVER = "/animus-diary/cover.png";
const DIARY_OPENING = "/animus-diary/opening.png";
const DIARY_OPEN = "/animus-diary/open.png";
const SKILL_COLORS = ["#1e8c66", "#6155d6", "#2f78be", "#c17b22", "#ca5e4f", "#3b9b9a", "#9662ce", "#8f6d1f"];

const TABS: ReadonlyArray<{ key: DiaryTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "skills", label: "Skills" },
  { key: "patterns", label: "Patterns" },
  { key: "contacts", label: "Contacts" },
  { key: "growth", label: "Growth" },
];

function cleanText(value?: string): string {
  return String(value || "").split(/\s+/).filter(Boolean).join(" ").trim();
}

function entryKey(entry: AnimusDiaryEntry, index = 0): string {
  return String(entry.created_at || entry.timestamp || entry.title || `entry-${index}`);
}

function formatDate(value?: string): string {
  if (!value) return "Gerade eben";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

function humanTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function looksTechnicalLabel(value?: string): boolean {
  const text = cleanText(value);
  if (!text) return true;
  const normalized = text.toLowerCase();
  if (
    normalized.includes("voice_confirmed") ||
    normalized.includes("working") ||
    normalized.includes("patient") ||
    normalized.includes("aligner") ||
    normalized.includes("multiband") ||
    normalized.includes("kontrolle") ||
    normalized.includes("behandlung") ||
    normalized.includes("bogenwechsel") ||
    normalized.includes("schiene")
  ) {
    return true;
  }
  return /^[a-z0-9_-]+$/i.test(text);
}

function bodyParagraphs(entry: AnimusDiaryEntry): string[] {
  return String(entry.body || "")
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function fallbackTitleFromBody(entry: AnimusDiaryEntry): string {
  const firstParagraph = bodyParagraphs(entry)[0] || "";
  const firstSentence = cleanText(firstParagraph.split(/(?<=[.!?])/)[0]);
  if (!firstSentence) return "Private Reflection";
  const words = firstSentence.split(/\s+/).slice(0, 10).join(" ");
  return words.length >= firstSentence.length ? firstSentence : `${words}...`;
}

function displayEntryTitle(entry: AnimusDiaryEntry): string {
  const raw = cleanText(entry.title);
  if (raw && !looksTechnicalLabel(raw)) {
    const parts = raw.split(/\s+[|/-]\s+|\|/g).map((part) => cleanText(part)).filter(Boolean);
    if (parts.length > 1) {
      const candidate = parts[parts.length - 1]!;
      if (!looksTechnicalLabel(candidate)) return candidate;
    }
    return raw;
  }
  return fallbackTitleFromBody(entry);
}

function displayEntryNumber(entry: AnimusDiaryEntry, index: number, total: number): string {
  const sequence = Number(entry.sequence || 0);
  const value = sequence > 0 ? sequence : total - index;
  return String(Math.max(1, value)).padStart(2, "0");
}

function normalizeContactLabel(value?: string): string {
  const text = cleanText(value);
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes("schubert")) return "Dr. Schubert";
  if (
    text.length > 34 ||
    /[0-9]/.test(text) ||
    text.includes("|") ||
    text.includes("ID ") ||
    text.includes("Patient") ||
    text.includes("Praxis") ||
    text.includes(". ")
  ) {
    return "";
  }
  const words = text.split(/\s+/);
  if (words.length > 3) return "";
  return text;
}

function groupContacts(entries: AnimusDiaryEntry[]): AggregatedFacet[] {
  const counts = new Map<string, AggregatedFacet>();
  entries.forEach((entry, index) => {
    const label = normalizeContactLabel(entry.contact);
    if (!label) return;
    const key = label.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      existing.entryKeys.push(entryKey(entry, index));
      return;
    }
    counts.set(key, { key, label, count: 1, entryKeys: [entryKey(entry, index)] });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

function aggregateDiaryTerms(entries: AnimusDiaryEntry[], key: "skills" | "patterns" | "growth"): AggregatedFacet[] {
  const counts = new Map<string, AggregatedFacet>();
  entries.forEach((entry, index) => {
    const items = Array.isArray(entry[key]) ? entry[key] : [];
    items.forEach((raw) => {
      const label = cleanText(raw);
      if (!label) return;
      const normalized = label.toLowerCase();
      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
        if (!existing.entryKeys.includes(entryKey(entry, index))) existing.entryKeys.push(entryKey(entry, index));
        return;
      }
      counts.set(normalized, {
        key: normalized,
        label,
        count: 1,
        entryKeys: [entryKey(entry, index)],
      });
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

function fallbackFacts(facts: AnimusLearningFact[], category: string): AggregatedFacet[] {
  return facts
    .filter((fact) => fact.category === category && cleanText(fact.text))
    .map((fact) => ({
      key: fact.key,
      label: cleanText(fact.text),
      count: Number(fact.count || 0),
      entryKeys: [],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

function groupEntriesByDate(entries: AnimusDiaryEntry[]): Array<{ date: string; entries: AnimusDiaryEntry[] }> {
  const groups = new Map<string, AnimusDiaryEntry[]>();
  entries.forEach((entry) => {
    const label = formatDate(entry.created_at || entry.timestamp);
    groups.set(label, [...(groups.get(label) || []), entry]);
  });
  return Array.from(groups.entries()).map(([date, items]) => ({ date, entries: items }));
}

function DiaryTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 18px",
        border: `1px solid ${active ? "rgba(58,45,34,.25)" : "rgba(119,99,73,.18)"}`,
        background: active ? "#2d241d" : "rgba(255,255,255,.38)",
        color: active ? "#fbf4e8" : "#73624b",
        cursor: "pointer",
        fontFamily: SERIF_FONT,
        fontSize: 16,
        boxShadow: active ? "0 10px 24px rgba(35,24,16,.18)" : "none",
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

function MetaChip({ label }: { label: string }): ReactElement {
  return (
    <span
      style={{
        padding: "7px 13px",
        borderRadius: 999,
        border: "1px solid rgba(151,124,95,.22)",
        background: "rgba(255,250,241,.92)",
        color: "#7b654c",
        fontSize: 12,
        letterSpacing: ".03em",
      }}
    >
      {label}
    </span>
  );
}

function JournalEntry({ entry, index, total }: { entry: AnimusDiaryEntry; index: number; total: number }): ReactElement {
  const title = displayEntryTitle(entry);
  const paragraphs = bodyParagraphs(entry);
  return (
    <article
      style={{
        position: "relative",
        paddingLeft: 34,
        maxWidth: 980,
        width: "100%",
        justifySelf: "center",
      }}
    >
      <div style={{ position: "absolute", top: 8, bottom: 10, left: 8, width: 1.5, background: "rgba(181,158,132,.34)" }} />
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 3,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: "rgba(181,158,132,.86)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: HAND_FONT, fontSize: 34, lineHeight: 1.08, color: "#2d241c", fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ textAlign: "right", color: "rgba(74,58,41,.5)", fontSize: 13, whiteSpace: "nowrap", paddingTop: 4 }}>
          <div>{humanTime(entry.created_at || entry.timestamp)}</div>
          <div style={{ marginTop: 8, fontFamily: SERIF_FONT, fontSize: 42, lineHeight: 1, opacity: 0.16 }}>
            {displayEntryNumber(entry, index, total)}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          color: "#2d241c",
          fontFamily: HAND_FONT,
          fontSize: 18,
          lineHeight: 1.95,
          letterSpacing: ".01em",
          maxWidth: 900,
        }}
      >
        {paragraphs.length ? (
          paragraphs.map((paragraph, paragraphIndex) => (
            <p key={`${entryKey(entry, paragraphIndex)}-p-${paragraphIndex}`} style={{ margin: paragraphIndex === paragraphs.length - 1 ? 0 : "0 0 28px" }}>
              {paragraph}
            </p>
          ))
        ) : (
          <p style={{ margin: 0 }}>Noch kein ausgeschriebener Eintrag vorhanden.</p>
        )}
      </div>

      {entry.tags?.length ? (
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.tags.map((tag, tagIndex) => (
            <MetaChip key={`${entryKey(entry, tagIndex)}-tag-${tagIndex}`} label={tag} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SkillConstellation({
  title,
  items,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: AggregatedFacet[];
  selectedKey: string;
  onSelect: (value: string) => void;
}): ReactElement {
  if (!items.length) return <Empty text={`Noch keine ${title.toLowerCase()} vorhanden.`} />;
  return (
    <section
      style={{
        borderRadius: 32,
        border: "1px solid rgba(153,129,101,.14)",
        background: "rgba(250,244,234,.76)",
        padding: "28px 34px 32px",
        maxWidth: 1040,
        width: "100%",
        justifySelf: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.62)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div style={{ color: "rgba(74,58,41,.52)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase" }}>{title}</div>
        {selectedKey ? <DiaryTabButton active={false} label="Filter loesen" onClick={() => onSelect("")} /> : null}
      </div>
      <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: "16px 18px" }}>
        {items.map((item, index) => {
          const active = selectedKey === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(active ? "" : item.key)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: SKILL_COLORS[index % SKILL_COLORS.length],
                fontFamily: HAND_FONT,
                fontSize: 24,
                lineHeight: 1.15,
                textDecoration: active ? "underline" : "none",
                textUnderlineOffset: "6px",
              }}
            >
              {item.label}
              <span style={{ marginLeft: 4, fontSize: 18, opacity: 0.72 }}>+{item.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CompactFacetSection({
  title,
  items,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: AggregatedFacet[];
  selectedKey: string;
  onSelect: (value: string) => void;
}): ReactElement | null {
  if (!items.length) return null;
  return (
    <details
      open={Boolean(selectedKey)}
      style={{
        maxWidth: 1040,
        width: "100%",
        justifySelf: "center",
        borderRadius: 24,
        border: "1px solid rgba(153,129,101,.12)",
        background: "rgba(255,249,239,.62)",
        padding: "14px 18px 16px",
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "none", color: "rgba(74,58,41,.56)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase" }}>
        {title}
      </summary>
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {items.map((item) => {
          const active = selectedKey === item.key;
          return (
            <DiaryTabButton
              key={item.key}
              active={active}
              label={`${item.label} (${item.count})`}
              onClick={() => onSelect(active ? "" : item.key)}
            />
          );
        })}
      </div>
    </details>
  );
}

function ContactsBoard({
  contacts,
  selectedKey,
  onSelect,
}: {
  contacts: AggregatedFacet[];
  selectedKey: string;
  onSelect: (value: string) => void;
}): ReactElement {
  if (!contacts.length) return <Empty text="Noch keine sauberen Kontaktspuren vorhanden." />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, maxWidth: 1040, width: "100%", justifySelf: "center" }}>
      {contacts.map((contact, index) => (
        <button
          key={contact.key}
          onClick={() => onSelect(selectedKey === contact.key ? "" : contact.key)}
          style={{
            borderRadius: 26,
            border: `1px solid ${selectedKey === contact.key ? "rgba(58,45,34,.25)" : "rgba(153,129,101,.18)"}`,
            background: selectedKey === contact.key ? "rgba(56,43,32,.92)" : "rgba(255,250,241,.86)",
            color: selectedKey === contact.key ? "#f7ede0" : "#3b3025",
            padding: "24px",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ color: selectedKey === contact.key ? "rgba(251,244,232,.62)" : "rgba(74,58,41,.46)", fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase" }}>
            {String(index + 1).padStart(2, "0")}
          </div>
          <div style={{ marginTop: 18, fontFamily: SERIF_FONT, fontSize: 34, lineHeight: 1.05 }}>{contact.label}</div>
          <div style={{ marginTop: 10, color: selectedKey === contact.key ? "rgba(251,244,232,.8)" : "rgba(74,58,41,.62)", fontStyle: "italic", fontSize: 16 }}>
            {contact.count} Diary-Eintraege
          </div>
        </button>
      ))}
    </div>
  );
}

export function DiaryPanel({ open, snapshot, onClose, onRefresh }: DiaryPanelProps): ReactElement | null {
  const [tab, setTab] = useState<DiaryTab>("all");
  const [stage, setStage] = useState<DiaryStage>("cover");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedGrowth, setSelectedGrowth] = useState("");
  const [selectedContact, setSelectedContact] = useState("");

  const diary = snapshot?.diary_entries ?? [];
  const facts = snapshot?.facts ?? [];

  const contacts = useMemo(() => groupContacts(diary), [diary]);
  const skillFacts = useMemo(() => {
    const diaryFacts = aggregateDiaryTerms(diary, "skills");
    return diaryFacts.length ? diaryFacts : fallbackFacts(facts, "skill");
  }, [diary, facts]);
  const patternFacts = useMemo(() => {
    const diaryFacts = aggregateDiaryTerms(diary, "patterns");
    return diaryFacts.length ? diaryFacts : fallbackFacts(facts, "pattern");
  }, [diary, facts]);
  const growthFacts = useMemo(() => {
    const diaryFacts = aggregateDiaryTerms(diary, "growth");
    return diaryFacts.length ? diaryFacts : fallbackFacts(facts, "growth");
  }, [diary, facts]);

  const filteredDiary = useMemo(() => {
    const contactMap = new Map(contacts.map((contact) => [contact.key, contact.label]));
    return diary.filter((entry, index) => {
      const key = entryKey(entry, index);
      if (selectedSkill && !skillFacts.find((fact) => fact.key === selectedSkill)?.entryKeys.includes(key)) return false;
      if (selectedPattern && !patternFacts.find((fact) => fact.key === selectedPattern)?.entryKeys.includes(key)) return false;
      if (selectedGrowth && !growthFacts.find((fact) => fact.key === selectedGrowth)?.entryKeys.includes(key)) return false;
      if (selectedContact) {
        const label = normalizeContactLabel(entry.contact);
        if (contactMap.get(selectedContact) !== label) return false;
      }
      return true;
    });
  }, [contacts, diary, growthFacts, patternFacts, selectedContact, selectedGrowth, selectedPattern, selectedSkill, skillFacts]);

  const groups = useMemo(() => groupEntriesByDate(filteredDiary), [filteredDiary]);

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
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {onRefresh ? <DiaryTabButton active={false} label="Refresh" onClick={onRefresh} /> : null}
              <button
                onClick={onClose}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6c5841", fontSize: 26, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
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
            position: "sticky",
            top: 0,
            zIndex: 1,
            padding: "16px 36px 16px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            borderBottom: "1px solid rgba(141,119,93,.12)",
            background: "linear-gradient(180deg, rgba(246,239,223,.98), rgba(241,232,215,.94))",
            backdropFilter: "blur(10px)",
          }}
        >
          {TABS.map((entry) => (
            <DiaryTabButton key={entry.key} label={entry.label} active={tab === entry.key} onClick={() => setTab(entry.key)} />
          ))}
        </div>

        <div style={{ padding: "26px 36px 48px", display: "grid", gap: 28, alignContent: "start" }}>
          {(tab === "all" || tab === "skills") && skillFacts.length ? (
            <SkillConstellation title="Evolved Skills" items={skillFacts} selectedKey={selectedSkill} onSelect={setSelectedSkill} />
          ) : null}

          {(tab === "all" || tab === "patterns") && patternFacts.length ? (
            <CompactFacetSection title="Patterns" items={patternFacts} selectedKey={selectedPattern} onSelect={setSelectedPattern} />
          ) : null}

          {(tab === "all" || tab === "growth") && growthFacts.length ? (
            <CompactFacetSection title="Growth" items={growthFacts} selectedKey={selectedGrowth} onSelect={setSelectedGrowth} />
          ) : null}

          {(tab === "all" || tab === "contacts") && contacts.length > 1 ? (
            <CompactFacetSection title="Contacts" items={contacts} selectedKey={selectedContact} onSelect={setSelectedContact} />
          ) : null}

          {tab === "all" ? (
            groups.length ? (
              <div style={{ display: "grid", gap: 32 }}>
                {groups.map((group) => (
                  <section key={group.date} style={{ display: "grid", gap: 18 }}>
                    <div
                      style={{
                        maxWidth: 1040,
                        width: "100%",
                        justifySelf: "center",
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 18,
                        alignItems: "center",
                        color: "rgba(74,58,41,.46)",
                        fontSize: 13,
                        letterSpacing: ".24em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>{group.date}</span>
                      <span style={{ borderTop: "1px solid rgba(141,119,93,.18)" }} />
                      <span>{group.entries.length} Eintraege</span>
                    </div>
                    <div style={{ display: "grid", gap: 24 }}>
                      {group.entries.map((entry, index) => (
                        <JournalEntry key={entryKey(entry, index)} entry={entry} index={index} total={diary.length} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <Empty text="Noch keine Diary-Einträge vorhanden." />
            )
          ) : null}

          {tab === "skills" ? (
            groups.length ? (
              <div style={{ display: "grid", gap: 24 }}>
                {filteredDiary.map((entry, index) => (
                  <JournalEntry key={entryKey(entry, index)} entry={entry} index={index} total={diary.length} />
                ))}
              </div>
            ) : (
              <Empty text="Noch keine Skill-gebundenen Einträge vorhanden." />
            )
          ) : null}

          {tab === "patterns" ? (
            groups.length ? (
              <div style={{ display: "grid", gap: 24 }}>
                {filteredDiary.map((entry, index) => (
                  <JournalEntry key={entryKey(entry, index)} entry={entry} index={index} total={diary.length} />
                ))}
              </div>
            ) : (
              <Empty text="Noch keine Pattern-Einträge vorhanden." />
            )
          ) : null}

          {tab === "growth" ? (
            groups.length ? (
              <div style={{ display: "grid", gap: 24 }}>
                {filteredDiary.map((entry, index) => (
                  <JournalEntry key={entryKey(entry, index)} entry={entry} index={index} total={diary.length} />
                ))}
              </div>
            ) : (
              <Empty text="Noch keine Growth-Einträge vorhanden." />
            )
          ) : null}

          {tab === "contacts" ? <ContactsBoard contacts={contacts} selectedKey={selectedContact} onSelect={setSelectedContact} /> : null}
        </div>
      </section>
    </div>
  );
}
