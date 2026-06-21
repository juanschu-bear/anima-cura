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
  background: "#f6f1e9",
  color: "#2c2a25",
  display: "block",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
};

const SERIF_FONT = '"Cormorant Garamond", "Iowan Old Style", "Georgia", serif';
const HAND_FONT = '"Caveat", "Noteworthy", "Segoe Print", "Bradley Hand", cursive';
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

const SKILL_COLORS = ["#1d7a5a", "#6b5aad", "#2a6ba0", "#b07d2a", "#b84a2a", "#a03d6a"];
const TAG_COLORS: Record<string, string> = {
  skill: "#1d7a5a",
  pattern: "#6b5aad",
  growth: "#b07d2a",
  other: "#8a8578",
};

function cleanText(value?: string): string {
  return String(value || "").split(/\s+/).filter(Boolean).join(" ").trim();
}

function entryKey(entry: AnimusDiaryEntry, index = 0): string {
  return String(entry.created_at || entry.timestamp || entry.title || `entry-${index}`);
}

function bodyParagraphs(entry: AnimusDiaryEntry): string[] {
  return String(entry.body || "")
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksTechnicalTitle(title?: string): boolean {
  const text = cleanText(title);
  if (!text) return true;
  const normalized = text.toLowerCase();
  return (
    normalized.includes("voice_confirmed") ||
    normalized.includes("patient") ||
    normalized.includes("behandlung") ||
    normalized.includes("multiband") ||
    normalized.includes("aligner") ||
    normalized.includes("bogenwechsel") ||
    /^[a-z0-9_-]+$/i.test(text)
  );
}

function displayTitle(entry: AnimusDiaryEntry): string {
  const raw = cleanText(entry.title);
  if (raw) {
    const pipeParts = raw.split("|").map((part) => cleanText(part)).filter(Boolean);
    if (pipeParts.length > 1) {
      const candidate = pipeParts[pipeParts.length - 1] || "";
      if (candidate && !looksTechnicalTitle(candidate)) return candidate;
    }
    const dashParts = raw.split(/[–-]/).map((part) => cleanText(part)).filter(Boolean);
    if (dashParts.length > 1) {
      const candidate = dashParts[dashParts.length - 1] || "";
      if (candidate && !looksTechnicalTitle(candidate)) return candidate;
    }
    if (!looksTechnicalTitle(raw)) return raw;
  }
  const firstParagraph = bodyParagraphs(entry)[0] || "";
  const firstSentence = cleanText(firstParagraph.split(/(?<=[.!?])/)[0]);
  if (!firstSentence) return "Private Reflection";
  const words = firstSentence.split(/\s+/).slice(0, 9).join(" ");
  return words.length >= firstSentence.length ? firstSentence : `${words}...`;
}

function normalizeContact(value?: string): string {
  const text = cleanText(value);
  if (!text) return "Unknown";
  const normalized = text.toLowerCase();
  if (normalized.includes("schubert")) return "Dr. Schubert";
  const firstWord = text.split(/\s+/)[0] || "Unknown";
  if (/[0-9|]/.test(firstWord)) return "Unknown";
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

function aggregate(entries: AnimusDiaryEntry[], key: "skills" | "patterns" | "growth"): AggregatedFacet[] {
  const counts = new Map<string, AggregatedFacet>();
  entries.forEach((entry, index) => {
    const items = Array.isArray(entry[key]) ? entry[key] : [];
    items.forEach((item) => {
      const label = cleanText(item);
      if (!label) return;
      const normalized = label.toLowerCase();
      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
        if (!existing.entryKeys.includes(entryKey(entry, index))) existing.entryKeys.push(entryKey(entry, index));
      } else {
        counts.set(normalized, {
          key: normalized,
          label,
          count: 1,
          entryKeys: [entryKey(entry, index)],
        });
      }
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

function aggregateContacts(entries: AnimusDiaryEntry[]): AggregatedFacet[] {
  const counts = new Map<string, AggregatedFacet>();
  entries.forEach((entry, index) => {
    const label = normalizeContact(entry.contact);
    const normalized = label.toLowerCase();
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
      existing.entryKeys.push(entryKey(entry, index));
    } else {
      counts.set(normalized, {
        key: normalized,
        label,
        count: 1,
        entryKeys: [entryKey(entry, index)],
      });
    }
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

function groupByDay(entries: AnimusDiaryEntry[]): Array<{ date: string; entries: AnimusDiaryEntry[] }> {
  const groups = new Map<string, AnimusDiaryEntry[]>();
  entries.forEach((entry) => {
    const dateKey = String(entry.created_at || entry.timestamp || "").slice(0, 10) || "unknown";
    groups.set(dateKey, [...(groups.get(dateKey) || []), entry]);
  });
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, entries: items }));
}

function formatPillDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function DiaryTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 18px",
        borderRadius: 20,
        fontSize: 13,
        cursor: "pointer",
        border: active ? "1px solid #d4cfc4" : "1px solid transparent",
        background: active ? "#e8e2d6" : "transparent",
        color: active ? "#4a4640" : "#a09b90",
        fontFamily: SERIF_FONT,
        fontWeight: 500,
        letterSpacing: "0.5px",
      }}
    >
      {label}
    </button>
  );
}

function ContactPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        padding: "10px 20px",
        borderRadius: 999,
        border: "1px solid #d4cfc4",
        background: active ? "#2c2a25" : "transparent",
        color: active ? "#f6f1e9" : "#8a8578",
        fontFamily: SERIF_FONT,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SkillBox({
  items,
  shut,
  onToggle,
  selectedKey,
  onSelect,
}: {
  items: AggregatedFacet[];
  shut: boolean;
  onToggle: () => void;
  selectedKey: string;
  onSelect: (value: string) => void;
}): ReactElement | null {
  if (!items.length) return null;
  return (
    <div
      style={{
        marginBottom: shut ? 24 : 40,
        padding: "20px 24px",
        background: "#eee9de",
        borderRadius: 12,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <div style={{ fontSize: 12, color: "#a09b90", letterSpacing: "2px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
        ✦ Evolved skills
        <span style={{ marginLeft: "auto", fontSize: 11, transform: shut ? "rotate(-90deg)" : "none", transition: "transform .25s" }}>▼</span>
      </div>
      {!shut ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {items.map((item, index) => (
            <button
              key={item.key}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(selectedKey === item.key ? "" : item.key);
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                fontFamily: HAND_FONT,
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: SKILL_COLORS[index % SKILL_COLORS.length],
                textDecoration: selectedKey === item.key ? "underline" : "none",
                textUnderlineOffset: "4px",
              }}
            >
              {item.label}
              <span style={{ fontSize: 14, opacity: 0.5 }}>+{item.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EntryView({ entry }: { entry: AnimusDiaryEntry }): ReactElement {
  const time = formatTime(entry.created_at || entry.timestamp);
  return (
    <div style={{ marginBottom: 50, paddingLeft: 22, borderLeft: "1.5px solid #d4cfc4", position: "relative" }}>
      <div
        style={{
          content: '""',
          position: "absolute",
          left: -4,
          top: 8,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#c4bdb0",
        }}
      />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <p style={{ margin: 0, fontFamily: HAND_FONT, fontSize: 28, fontWeight: 600, color: "#2c2a25", lineHeight: 1.2 }}>
          {displayTitle(entry)}
        </p>
        {time ? <span style={{ fontFamily: HAND_FONT, fontSize: 20, color: "#a09b90", whiteSpace: "nowrap", lineHeight: 1 }}>{time}</span> : null}
      </div>
      <div style={{ fontFamily: HAND_FONT, fontSize: 24, lineHeight: 1.75, color: "#3d3a34", whiteSpace: "pre-wrap" }}>
        {bodyParagraphs(entry).join("\n\n")}
      </div>
      {entry.tags?.length ? (
        <div style={{ fontFamily: HAND_FONT, fontSize: 20, lineHeight: 1.8, color: "#8a8578", marginTop: 18 }}>
          <span style={{ fontStyle: "italic", color: "#a09b90" }}>Tags: </span>
          {entry.tags.map((tag, index) => {
            const color = TAG_COLORS[index % 2 === 0 ? "skill" : "pattern"] || "#8a8578";
            return (
              <span key={`${entryKey(entry, index)}-tag-${index}`}>
                <span style={{ color }}>{tag}</span>
                {index < entry.tags!.length - 1 ? <span>, </span> : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ text }: { text: string }): ReactElement {
  return <div style={{ textAlign: "center", color: "#8a8578", fontStyle: "italic", padding: "20px 0 40px", fontFamily: SERIF_FONT }}>{text}</div>;
}

export function DiaryPanel({ open, snapshot, onClose, onRefresh }: DiaryPanelProps): ReactElement | null {
  const [tab, setTab] = useState<DiaryTab>("all");
  const [skillsShut, setSkillsShut] = useState(false);
  const [stage, setStage] = useState<DiaryStage>("cover");
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedGrowth, setSelectedGrowth] = useState("");

  const diary = snapshot?.diary_entries ?? [];
  const facts = snapshot?.facts ?? [];

  const skillAggs = useMemo(() => {
    const diaryAggs = aggregate(diary, "skills");
    return diaryAggs.length ? diaryAggs : fallbackFacts(facts, "skill");
  }, [diary, facts]);
  const patternAggs = useMemo(() => {
    const diaryAggs = aggregate(diary, "patterns");
    return diaryAggs.length ? diaryAggs : fallbackFacts(facts, "pattern");
  }, [diary, facts]);
  const growthAggs = useMemo(() => {
    const diaryAggs = aggregate(diary, "growth");
    return diaryAggs.length ? diaryAggs : fallbackFacts(facts, "growth");
  }, [diary, facts]);
  const contactAggs = useMemo(() => aggregateContacts(diary), [diary]);

  const filteredEntries = useMemo(() => {
    return diary.filter((entry, index) => {
      const key = entryKey(entry, index);
      if (selectedContact && normalizeContact(entry.contact).toLowerCase() !== selectedContact) return false;
      if (selectedSkill) {
        const source = skillAggs.find((item) => item.key === selectedSkill);
        if (source && source.entryKeys.length && !source.entryKeys.includes(key)) return false;
      }
      if (selectedPattern) {
        const source = patternAggs.find((item) => item.key === selectedPattern);
        if (source && source.entryKeys.length && !source.entryKeys.includes(key)) return false;
      }
      if (selectedGrowth) {
        const source = growthAggs.find((item) => item.key === selectedGrowth);
        if (source && source.entryKeys.length && !source.entryKeys.includes(key)) return false;
      }
      return true;
    });
  }, [diary, growthAggs, patternAggs, selectedContact, selectedGrowth, selectedPattern, selectedSkill, skillAggs]);

  const groups = useMemo(() => groupByDay(filteredEntries), [filteredEntries]);

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

  useEffect(() => {
    const next: Record<string, boolean> = {};
    groups.forEach((group) => {
      next[group.date] = true;
    });
    setOpenDays(next);
  }, [groups]);

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
          <div style={{ marginTop: 36, fontFamily: SERIF_FONT, fontSize: 54, lineHeight: 1.02, color: "#efe2c6" }}>Diary</div>
          <div style={{ marginTop: 22, color: "rgba(227,206,169,.72)", fontFamily: SERIF_FONT, fontSize: 23, fontStyle: "italic", lineHeight: 1.45 }}>
            Private reflections, lessons, patterns, and shifts in how ANIMUS thinks.
          </div>
        </div>
        <div>
          <div style={{ color: "rgba(215,194,154,.58)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase" }}>{diary.length} entries</div>
          <div style={{ marginTop: 10, color: "rgba(215,194,154,.42)", fontFamily: SERIF_FONT, fontSize: 17, fontStyle: "italic" }}>
            tap to open the next layer of learning
          </div>
        </div>
      </section>

      <section style={PAGE}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 40px 80px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ color: "#85764d", fontSize: 11, letterSpacing: 4, textTransform: "uppercase", marginBottom: 16 }}>Diary</div>
            <h1 style={{ fontFamily: SERIF_FONT, fontSize: 42, fontWeight: 400, color: "#2c2a25", margin: "0 0 8px" }}>ANIMUS&apos; Diary</h1>
            <p style={{ fontStyle: "italic", fontSize: 17, color: "#8a8578", margin: "0 0 14px", fontFamily: SERIF_FONT }}>
              What I learned, what I noticed, what I would do differently.
            </p>
            <p style={{ fontSize: 12, color: "#a09b90", letterSpacing: 2, textTransform: "uppercase" }}>{diary.length} entries</p>
          </div>

          <div style={{ width: 50, height: 1, background: "#d4cfc4", margin: "0 auto 32px" }} />

          <div
            style={{
              marginBottom: 34,
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(141,119,93,.18)",
              boxShadow: "0 14px 40px rgba(60,46,28,.12)",
            }}
          >
            <img src={DIARY_OPEN} alt="Geoeffnetes ANIMUS Diary" style={{ width: "100%", display: "block", maxHeight: 230, objectFit: "cover", objectPosition: "center 56%" }} />
          </div>

          {contactAggs.length > 1 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
              <ContactPill active={selectedContact === null} label={`All (${diary.length})`} onClick={() => setSelectedContact(null)} />
              {contactAggs.map((contact) => (
                <ContactPill
                  key={contact.key}
                  active={selectedContact === contact.key}
                  label={`${contact.label} (${contact.count})`}
                  onClick={() => setSelectedContact(selectedContact === contact.key ? null : contact.key)}
                />
              ))}
            </div>
          ) : null}

          <SkillBox items={skillAggs} shut={skillsShut} onToggle={() => setSkillsShut((value) => !value)} selectedKey={selectedSkill} onSelect={setSelectedSkill} />

          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {TABS.map((item) => (
              <DiaryTabButton key={item.key} active={tab === item.key} label={item.label} onClick={() => setTab(item.key)} />
            ))}
            {onRefresh ? <DiaryTabButton active={false} label="Refresh" onClick={onRefresh} /> : null}
          </div>

          {groups.length > 1 && tab === "all" ? (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 2px 14px", marginBottom: 30 }}>
              {groups.map((group) => (
                <button
                  key={group.date}
                  onClick={() => setOpenDays((prev) => ({ ...prev, [group.date]: !prev[group.date] }))}
                  style={{
                    flex: "0 0 auto",
                    padding: "5px 14px",
                    borderRadius: 999,
                    border: `0.5px solid ${openDays[group.date] ? "#2c2a25" : "#d4cfc4"}`,
                    background: openDays[group.date] ? "#2c2a25" : "transparent",
                    color: openDays[group.date] ? "#f6f1e9" : "#8a8578",
                    fontFamily: SERIF_FONT,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {formatPillDate(group.date)}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "patterns" && patternAggs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 30 }}>
              {patternAggs.map((pattern) => (
                <ContactPill
                  key={pattern.key}
                  active={selectedPattern === pattern.key}
                  label={`${pattern.label} (${pattern.count})`}
                  onClick={() => setSelectedPattern(selectedPattern === pattern.key ? "" : pattern.key)}
                />
              ))}
            </div>
          ) : null}

          {tab === "growth" && growthAggs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 30 }}>
              {growthAggs.map((growth) => (
                <ContactPill
                  key={growth.key}
                  active={selectedGrowth === growth.key}
                  label={`${growth.label} (${growth.count})`}
                  onClick={() => setSelectedGrowth(selectedGrowth === growth.key ? "" : growth.key)}
                />
              ))}
            </div>
          ) : null}

          {tab === "contacts" && contactAggs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 30 }}>
              {contactAggs.map((contact) => (
                <ContactPill
                  key={contact.key}
                  active={selectedContact === contact.key}
                  label={`${contact.label} (${contact.count})`}
                  onClick={() => setSelectedContact(selectedContact === contact.key ? null : contact.key)}
                />
              ))}
            </div>
          ) : null}

          {!filteredEntries.length ? (
            <Empty text="No entries yet." />
          ) : (
            groups.map((group) => (
              <div key={group.date} style={{ marginBottom: 45 }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "8px 0", marginBottom: 30, userSelect: "none" }}
                  onClick={() => setOpenDays((prev) => ({ ...prev, [group.date]: !prev[group.date] }))}
                >
                  <span style={{ fontSize: 13, color: "#a09b90", letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {formatLongDate(group.date)}
                  </span>
                  <span style={{ flex: 1, height: 0.5, background: "#d4cfc4" }} />
                  <span style={{ fontSize: 11, color: "#a09b90", letterSpacing: 1 }}>
                    {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                  </span>
                  <span style={{ color: "#a09b90", fontSize: 12, transform: openDays[group.date] ? "none" : "rotate(-90deg)", transition: "transform .25s" }}>▼</span>
                </div>
                {openDays[group.date] ? (
                  <div>
                    {group.entries.map((entry, index) => (
                      <EntryView key={entryKey(entry, index)} entry={entry} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
