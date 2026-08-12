import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InboxBody = {
  art?: string;
  titel?: string;
  text?: string;
  kategorie?: string;
  prioritaet?: string;
  bereich?: string;
  erinnerung?: string;
};

type InboxStatus = "offen" | "in_arbeit" | "erledigt";
type InboxArt = "anliegen" | "idee" | "aufgabe" | "frage" | "inspiration";
type InboxPrioritaet = "niedrig" | "mittel" | "hoch";

type InboxEintrag = {
  id: string;
  art: InboxArt;
  titel: string;
  text: string;
  kategorie: string;
  prioritaet: InboxPrioritaet;
  bereich: string | null;
  status: InboxStatus;
  faellig_am: string;
  erstellt_von: string | null;
  erstellt_von_name: string | null;
  erstellt_am: string;
  erledigt_am: string | null;
};

const ARTEN = new Set(["anliegen", "idee", "aufgabe", "frage", "inspiration"]);
const PRIORITAETEN = new Set(["niedrig", "mittel", "hoch"]);
const ERINNERUNGEN = new Set(["heute", "morgen", "diese_woche"]);

function isoHeute(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function endeDieserWoche(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? 5 : Math.max(0, 5 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function faelligkeitAusPreset(preset: string | undefined): string {
  const heute = isoHeute();
  if (preset === "morgen") return addDays(heute, 1);
  if (preset === "diese_woche") return endeDieserWoche(heute);
  return heute;
}

async function ladeInbox(service: ReturnType<typeof createServerClient>): Promise<InboxEintrag[]> {
  const { data } = await service
    .from("einstellungen")
    .select("value")
    .eq("key", "scribe_praxis_inbox")
    .maybeSingle<{ value: InboxEintrag[] }>();

  if (!data?.value || !Array.isArray(data.value)) return [];
  return data.value;
}

async function speichereInbox(service: ReturnType<typeof createServerClient>, inbox: InboxEintrag[]) {
  return service
    .from("einstellungen")
    .upsert(
      {
        key: "scribe_praxis_inbox",
        value: inbox,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
}

async function ladeUser() {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, name: "" };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const name =
    profile?.display_name ||
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email ||
    "Praxis";

  return { user, name };
}

export async function GET() {
  const { user } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const service = createServerClient();
  const heute = isoHeute();
  const data = await ladeInbox(service);

  const eintraege = data
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      if (a.faellig_am !== b.faellig_am) return a.faellig_am.localeCompare(b.faellig_am);
      return b.erstellt_am.localeCompare(a.erstellt_am);
    })
    .slice(0, 50)
    .map((eintrag) => ({
    ...eintrag,
    istHeute: eintrag.status !== "erledigt" && eintrag.faellig_am <= heute,
    }));

  const offenHeute = eintraege.filter((eintrag) => eintrag.istHeute).length;

  return NextResponse.json({ eintraege, offenHeute, heute });
}

export async function POST(request: NextRequest) {
  const { user, name } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as InboxBody | null;
  if (!body) return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });

  const art = String(body.art ?? "").trim();
  const text = String(body.text ?? "").trim();
  const titel = String(body.titel ?? "").trim() || text.split(/[.!?\n]/)[0]?.trim() || "Neuer Eintrag";
  const kategorie = String(body.kategorie ?? "").trim() || "Praxis";
  const prioritaet = String(body.prioritaet ?? "mittel").trim();
  const bereich = String(body.bereich ?? "").trim() || null;
  const erinnerung = String(body.erinnerung ?? "heute").trim();

  if (!ARTEN.has(art)) return NextResponse.json({ error: "Art ist ungültig" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Bitte kurz beschreiben, worum es geht" }, { status: 400 });
  if (!PRIORITAETEN.has(prioritaet)) return NextResponse.json({ error: "Priorität ist ungültig" }, { status: 400 });
  if (!ERINNERUNGEN.has(erinnerung)) return NextResponse.json({ error: "Erinnerung ist ungültig" }, { status: 400 });

  const service = createServerClient();
  const inbox = await ladeInbox(service);
  const eintrag: InboxEintrag = {
    id: randomUUID(),
    art: art as InboxArt,
    titel: titel.slice(0, 120),
    text: text.slice(0, 1200),
    kategorie: kategorie.slice(0, 60),
    prioritaet: prioritaet as InboxPrioritaet,
    bereich: bereich ? bereich.slice(0, 60) : null,
    status: "offen",
    faellig_am: faelligkeitAusPreset(erinnerung),
    erstellt_von: user.id,
    erstellt_von_name: name,
    erstellt_am: new Date().toISOString(),
    erledigt_am: null,
  };
  const { error } = await speichereInbox(service, [eintrag, ...inbox]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eintrag }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!body?.id || !body.status) {
    return NextResponse.json({ error: "id und status nötig" }, { status: 400 });
  }

  const status = String(body.status);
  if (!["offen", "in_arbeit", "erledigt"].includes(status)) {
    return NextResponse.json({ error: "Status ist ungültig" }, { status: 400 });
  }

  const service = createServerClient();
  const inbox = await ladeInbox(service);
  const index = inbox.findIndex((eintrag) => eintrag.id === body.id);
  if (index === -1) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  const aktualisiert = {
    ...inbox[index],
    status: status as InboxStatus,
    erledigt_am: status === "erledigt" ? new Date().toISOString() : null,
  };
  const neu = inbox.slice();
  neu[index] = aktualisiert;

  const { error } = await speichereInbox(service, neu);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eintrag: aktualisiert });
}
