import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "behandlungslogik_regeln";

type StoredRule = {
  id: string;
  title: string;
  body: string;
  impacts: string[];
  created_at: string;
  updated_at: string;
};

function isStoredRule(value: unknown): value is StoredRule {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.body === "string" &&
    Array.isArray(entry.impacts) &&
    entry.impacts.every((impact) => typeof impact === "string") &&
    typeof entry.created_at === "string" &&
    typeof entry.updated_at === "string"
  );
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeImpacts(impacts: unknown): string[] {
  if (!Array.isArray(impacts)) return [];
  return impacts
    .map((impact) => cleanText(String(impact ?? "")))
    .filter(Boolean)
    .slice(0, 8);
}

async function requireUser() {
  const auth = createServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  return user;
}

async function readRules(db: ReturnType<typeof createServerClient>): Promise<StoredRule[]> {
  const { data, error } = await db.from("einstellungen").select("value").eq("key", KEY).maybeSingle();
  if (error) throw error;
  if (!Array.isArray(data?.value)) return [];
  return data.value.filter(isStoredRule);
}

async function writeRules(db: ReturnType<typeof createServerClient>, rules: StoredRule[]) {
  const { error } = await db.from("einstellungen").upsert(
    {
      key: KEY,
      value: rules,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  try {
    const db = createServerClient();
    const rules = await readRules(db);
    return NextResponse.json({ rules });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Laden fehlgeschlagen." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { title?: string; body?: string; impacts?: unknown }
    | null;

  const title = cleanText(String(body?.title ?? ""));
  const text = cleanText(String(body?.body ?? ""));
  const impacts = normalizeImpacts(body?.impacts);

  if (!title) return NextResponse.json({ error: "Titel fehlt." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Regelbeschreibung fehlt." }, { status: 400 });

  try {
    const db = createServerClient();
    const rules = await readRules(db);
    const now = new Date().toISOString();
    const nextRule: StoredRule = {
      id: crypto.randomUUID(),
      title,
      body: text,
      impacts,
      created_at: now,
      updated_at: now,
    };
    await writeRules(db, [nextRule, ...rules]);
    return NextResponse.json({ ok: true, rule: nextRule });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { id?: string; title?: string; body?: string; impacts?: unknown }
    | null;

  const id = cleanText(String(body?.id ?? ""));
  const title = cleanText(String(body?.title ?? ""));
  const text = cleanText(String(body?.body ?? ""));
  const impacts = normalizeImpacts(body?.impacts);

  if (!id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Titel fehlt." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Regelbeschreibung fehlt." }, { status: 400 });

  try {
    const db = createServerClient();
    const rules = await readRules(db);
    const existing = rules.find((rule) => rule.id === id);
    if (!existing) return NextResponse.json({ error: "Regel nicht gefunden." }, { status: 404 });

    const next = rules.map((rule) =>
      rule.id === id
        ? {
            ...rule,
            title,
            body: text,
            impacts,
            updated_at: new Date().toISOString(),
          }
        : rule,
    );
    await writeRules(db, next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aktualisieren fehlgeschlagen." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = cleanText(String(body?.id ?? ""));
  if (!id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });

  try {
    const db = createServerClient();
    const rules = await readRules(db);
    await writeRules(
      db,
      rules.filter((rule) => rule.id !== id),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Löschen fehlgeschlagen." }, { status: 500 });
  }
}
