import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getPracticeUpdateActor } from "@/lib/practice-update-auth";
import {
  canPublishPracticeUpdates,
  canReadPracticeUpdates,
  isVisiblePracticeUpdate,
  localizePracticeUpdate,
  practiceUpdateCreateSchema,
} from "@/lib/practice-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateRow = {
  id: string;
  slug: string;
  status: string;
  category: "neuerung" | "wichtig" | "hinweis";
  title_de: string;
  title_en: string;
  summary_de: string;
  summary_en: string;
  body_de: string;
  body_en: string;
  requires_acknowledgement: boolean;
  audience_roles: string[];
  visible_from: string | null;
  visible_until: string | null;
  published_at: string;
};

type ReceiptRow = {
  update_id: string;
  first_seen_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
};

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

function message(language: "de" | "en", de: string, en: string) {
  return language === "en" ? en : de;
}

export async function GET(request: NextRequest) {
  const user = await getPracticeUpdateActor().catch(() => null);
  const language = request.nextUrl.searchParams.get("lang") === "en" ? "en" : "de";
  if (!user) {
    return NextResponse.json({ error: message(language, "Nicht autorisiert.", "Not authorized.") }, { status: 401, headers: noStore });
  }
  if (!canReadPracticeUpdates(user.role)) {
    return NextResponse.json({ error: message(language, "Nur für das Praxisteam.", "Practice team access only.") }, { status: 403, headers: noStore });
  }

  const unreadOnly = request.nextUrl.searchParams.get("ungelesen") === "1";
  const parsedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.floor(parsedLimit))) : 50;
  const now = new Date();
  const db = createServerClient();
  const { data, error } = await db
    .from("praxis_updates")
    .select("id,slug,status,category,title_de,title_en,summary_de,summary_en,body_de,body_en,requires_acknowledgement,audience_roles,visible_from,visible_until,published_at")
    .eq("status", "published")
    .contains("audience_roles", [user.role])
    .order("published_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: message(language, "Neuerungen konnten nicht geladen werden.", "Updates could not be loaded.") }, { status: 503, headers: noStore });
  }

  const visible = ((data ?? []) as UpdateRow[]).filter((update) => isVisiblePracticeUpdate(update, user.role, now));
  const ids = visible.map((update) => update.id);
  let receipts: ReceiptRow[] = [];
  if (ids.length) {
    const result = await db
      .from("praxis_update_lesestaende")
      .select("update_id,first_seen_at,read_at,acknowledged_at")
      .eq("user_id", user.id)
      .in("update_id", ids);
    if (result.error) {
      return NextResponse.json({ error: message(language, "Lesestand konnte nicht geladen werden.", "Read status could not be loaded.") }, { status: 503, headers: noStore });
    }
    receipts = (result.data ?? []) as ReceiptRow[];
  }

  const byUpdate = new Map(receipts.map((receipt) => [receipt.update_id, receipt]));
  const enriched = visible.map((update) => {
    const receipt = byUpdate.get(update.id);
    return {
      id: update.id,
      slug: update.slug,
      category: update.category,
      ...localizePracticeUpdate(update, language),
      publishedAt: update.published_at,
      requiresAcknowledgement: update.requires_acknowledgement,
      firstSeenAt: receipt?.first_seen_at ?? null,
      readAt: receipt?.read_at ?? null,
      acknowledgedAt: receipt?.acknowledged_at ?? null,
      unread: !receipt?.read_at,
    };
  });
  const unreadCount = enriched.filter((update) => update.unread).length;
  const importantUnreadCount = enriched.filter((update) => update.unread && update.category === "wichtig").length;
  const updates = enriched.filter((update) => !unreadOnly || update.unread).slice(0, limit);

  return NextResponse.json({ updates, unreadCount, importantUnreadCount }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const user = await getPracticeUpdateActor().catch(() => null);
  const language = request.nextUrl.searchParams.get("lang") === "en" ? "en" : "de";
  if (!user) {
    return NextResponse.json({ error: message(language, "Nicht autorisiert.", "Not authorized.") }, { status: 401, headers: noStore });
  }
  if (!canPublishPracticeUpdates(user.role)) {
    return NextResponse.json({ error: message(language, "Nur die Praxisleitung kann Neuerungen veröffentlichen.", "Only practice management can publish updates.") }, { status: 403, headers: noStore });
  }

  const parsed = practiceUpdateCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: message(language, "Die Angaben zur Neuerung sind unvollständig.", "The update details are incomplete.") }, { status: 400, headers: noStore });
  }
  const input = parsed.data;
  const publishedAt = input.publish ? new Date().toISOString() : null;
  const { data, error } = await createServerClient()
    .from("praxis_updates")
    .insert({
      slug: input.slug,
      status: input.publish ? "published" : "draft",
      category: input.category,
      title_de: input.title.de,
      title_en: input.title.en,
      summary_de: input.summary.de,
      summary_en: input.summary.en,
      body_de: input.body.de,
      body_en: input.body.en,
      requires_acknowledgement: input.requiresAcknowledgement,
      audience_roles: input.audienceRoles,
      visible_from: input.visibleFrom,
      visible_until: input.visibleUntil,
      published_at: publishedAt,
      created_by: user.id,
    })
    .select("id,slug,status,published_at")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 503;
    const errorMessage = status === 409
      ? message(language, "Diese Neuerung gibt es bereits.", "This update already exists.")
      : message(language, "Die Neuerung konnte nicht gespeichert werden.", "The update could not be saved.");
    return NextResponse.json({ error: errorMessage }, { status, headers: noStore });
  }
  return NextResponse.json({ update: { id: data.id, slug: data.slug, status: data.status, publishedAt: data.published_at } }, { status: 201, headers: noStore });
}
