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
  assigned_to?: string | null;
};

type InboxStatus = "offen" | "in_arbeit" | "erledigt";
type InboxArt = "anliegen" | "idee" | "aufgabe" | "frage" | "inspiration";
type InboxPrioritaet = "niedrig" | "mittel" | "hoch";
type InboxKommentar = {
  id: string;
  text: string;
  erstellt_von: string | null;
  erstellt_von_name: string | null;
  erstellt_am: string;
  mention_user_id: string | null;
  mention_name: string | null;
  gelesen_von: string[];
};

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
  in_arbeit_am: string | null;
  erledigt_am: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  kommentare: InboxKommentar[];
};

type TeamMitglied = {
  id: string;
  name: string;
  role: string | null;
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

  if (!user) return { user: null, name: "", role: null };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const name =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.display_name ||
    user.email ||
    "Praxis";

  return { user, name, role: profile?.role ?? null };
}

async function ladeTeam(service: ReturnType<typeof createServerClient>): Promise<TeamMitglied[]> {
  const { data } = await service
    .from("user_profiles")
    .select("id, display_name, role, patient_id, email")
    .is("patient_id", null)
    .order("display_name", { ascending: true });

  return (data ?? [])
    .filter((eintrag) => eintrag.role !== "patient")
    .map((eintrag) => ({
      id: eintrag.id,
      name: eintrag.display_name || eintrag.email || "Praxis",
      role: eintrag.role ?? null,
    }));
}

function statusGewicht(status: InboxStatus): number {
  if (status === "offen") return 0;
  if (status === "in_arbeit") return 1;
  return 2;
}

export async function GET() {
  const { user, name, role } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const service = createServerClient();
  const heute = isoHeute();
  const [data, team] = await Promise.all([ladeInbox(service), ladeTeam(service)]);

  const eintraege = data
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) return statusGewicht(a.status) - statusGewicht(b.status);
      if (a.faellig_am !== b.faellig_am) return a.faellig_am.localeCompare(b.faellig_am);
      return b.erstellt_am.localeCompare(a.erstellt_am);
    })
    .slice(0, 50)
    .map((eintrag) => ({
      ...eintrag,
      kommentare: Array.isArray(eintrag.kommentare) ? eintrag.kommentare : [],
      istHeute: eintrag.status !== "erledigt" && eintrag.faellig_am <= heute,
      unread_mentions: (Array.isArray(eintrag.kommentare) ? eintrag.kommentare : []).filter((kommentar) =>
        kommentar.mention_user_id === user.id && !kommentar.gelesen_von?.includes(user.id)
      ).length,
    }));

  const offenHeute = eintraege.filter((eintrag) => eintrag.istHeute).length;
  const unreadCount = eintraege.reduce((summe, eintrag: any) => summe + (eintrag.unread_mentions ?? 0), 0);

  const teamMitFallback = team.length > 0 ? team : [{ id: user.id, name, role }];

  return NextResponse.json({
    eintraege,
    offenHeute,
    heute,
    unreadCount,
    team: teamMitFallback,
    currentUserId: user.id,
    canManageTeam: role === "admin" || role === "verwaltung",
  });
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
  const assignedTo = typeof body.assigned_to === "string" && body.assigned_to.trim() ? body.assigned_to.trim() : null;

  if (!ARTEN.has(art)) return NextResponse.json({ error: "Art ist ungültig" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Bitte kurz beschreiben, worum es geht" }, { status: 400 });
  if (!PRIORITAETEN.has(prioritaet)) return NextResponse.json({ error: "Priorität ist ungültig" }, { status: 400 });
  if (!ERINNERUNGEN.has(erinnerung)) return NextResponse.json({ error: "Erinnerung ist ungültig" }, { status: 400 });

  const service = createServerClient();
  const team = await ladeTeam(service);
  const assignedPerson = assignedTo ? team.find((eintrag) => eintrag.id === assignedTo) ?? null : null;
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
    in_arbeit_am: null,
    erledigt_am: null,
    assigned_to: assignedPerson?.id ?? null,
    assigned_to_name: assignedPerson?.name ?? null,
    kommentare: [],
  };
  const { error } = await speichereInbox(service, [eintrag, ...inbox]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eintrag }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, name } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    status?: string;
    kommentar_text?: string;
    mention_user_id?: string | null;
    assigned_to?: string | null;
    mark_mentions_read?: boolean;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "id nötig" }, { status: 400 });
  }

  const service = createServerClient();
  const team = await ladeTeam(service);
  const inbox = await ladeInbox(service);
  const index = inbox.findIndex((eintrag) => eintrag.id === body.id);
  if (index === -1) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  let aktualisiert: InboxEintrag = {
    ...inbox[index],
    kommentare: Array.isArray(inbox[index].kommentare) ? inbox[index].kommentare : [],
  };

  if (body.status) {
    const status = String(body.status);
    if (!["offen", "in_arbeit", "erledigt"].includes(status)) {
      return NextResponse.json({ error: "Status ist ungültig" }, { status: 400 });
    }
    aktualisiert = {
      ...aktualisiert,
      status: status as InboxStatus,
      in_arbeit_am:
        status === "in_arbeit"
          ? aktualisiert.in_arbeit_am ?? new Date().toISOString()
          : status === "offen"
            ? null
            : aktualisiert.in_arbeit_am,
      erledigt_am:
        status === "erledigt"
          ? new Date().toISOString()
          : status === "offen"
            ? null
            : aktualisiert.erledigt_am,
    };
  }

  if (body.assigned_to !== undefined) {
    const assignedTo = typeof body.assigned_to === "string" && body.assigned_to.trim() ? body.assigned_to.trim() : null;
    const assignedPerson = assignedTo ? team.find((eintrag) => eintrag.id === assignedTo) ?? null : null;
    aktualisiert = {
      ...aktualisiert,
      assigned_to: assignedPerson?.id ?? null,
      assigned_to_name: assignedPerson?.name ?? null,
    };
  }

  if (body.kommentar_text) {
    const text = body.kommentar_text.trim();
    if (!text) return NextResponse.json({ error: "Antwort darf nicht leer sein" }, { status: 400 });
    const mentionUserId =
      typeof body.mention_user_id === "string" && body.mention_user_id.trim()
        ? body.mention_user_id.trim()
        : null;
    const mentionPerson = mentionUserId ? team.find((eintrag) => eintrag.id === mentionUserId) ?? null : null;
    aktualisiert = {
      ...aktualisiert,
      kommentare: [
        ...aktualisiert.kommentare,
        {
          id: randomUUID(),
          text: text.slice(0, 1200),
          erstellt_von: user.id,
          erstellt_von_name: name,
          erstellt_am: new Date().toISOString(),
          mention_user_id: mentionPerson?.id ?? null,
          mention_name: mentionPerson?.name ?? null,
          gelesen_von: [user.id],
        },
      ],
    };
  }

  if (body.mark_mentions_read) {
    aktualisiert = {
      ...aktualisiert,
      kommentare: aktualisiert.kommentare.map((kommentar) =>
        kommentar.mention_user_id === user.id && !kommentar.gelesen_von.includes(user.id)
          ? { ...kommentar, gelesen_von: [...kommentar.gelesen_von, user.id] }
          : kommentar
      ),
    };
  }

  const neu = inbox.slice();
  neu[index] = aktualisiert;

  const { error } = await speichereInbox(service, neu);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eintrag: aktualisiert });
}

export async function DELETE(request: NextRequest) {
  const { user } = await ladeUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id nötig" }, { status: 400 });

  const service = createServerClient();
  const inbox = await ladeInbox(service);
  const neu = inbox.filter((eintrag) => eintrag.id !== body.id);
  if (neu.length === inbox.length) {
    return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  }
  const { error } = await speichereInbox(service, neu);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
