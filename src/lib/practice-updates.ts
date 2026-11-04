import { z } from "zod";
import type { AppRole } from "@/lib/auth";

export const PRACTICE_UPDATE_ROLES = ["admin", "verwaltung", "lesezugriff"] as const;
export type PracticeUpdateRole = (typeof PRACTICE_UPDATE_ROLES)[number];

export const practiceUpdateCreateSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(["neuerung", "wichtig", "hinweis"]).default("neuerung"),
  title: z.object({ de: z.string().trim().min(1).max(160), en: z.string().trim().min(1).max(160) }),
  summary: z.object({ de: z.string().trim().min(1).max(500), en: z.string().trim().min(1).max(500) }),
  body: z.object({ de: z.string().trim().min(1).max(20_000), en: z.string().trim().min(1).max(20_000) }),
  requiresAcknowledgement: z.boolean().default(false),
  audienceRoles: z.array(z.enum(PRACTICE_UPDATE_ROLES)).min(1).max(3).default([...PRACTICE_UPDATE_ROLES]),
  visibleFrom: z.string().datetime({ offset: true }).nullable().default(null),
  visibleUntil: z.string().datetime({ offset: true }).nullable().default(null),
  publish: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.visibleFrom && value.visibleUntil && Date.parse(value.visibleUntil) <= Date.parse(value.visibleFrom)) {
    context.addIssue({ code: "custom", path: ["visibleUntil"], message: "visibleUntil must be later than visibleFrom" });
  }
});

export const practiceUpdateStatusSchema = z.object({ action: z.enum(["read", "acknowledge"]) });

export type PracticeUpdateCreateInput = z.infer<typeof practiceUpdateCreateSchema>;

export function canReadPracticeUpdates(role: AppRole): role is PracticeUpdateRole {
  return role === "admin" || role === "verwaltung" || role === "lesezugriff";
}

export function canPublishPracticeUpdates(role: AppRole): boolean {
  return role === "admin";
}

export function isVisiblePracticeUpdate(
  update: { status: string; audience_roles: string[]; visible_from: string | null; visible_until: string | null },
  role: AppRole,
  now = new Date(),
): boolean {
  if (update.status !== "published" || !canReadPracticeUpdates(role) || !update.audience_roles.includes(role)) return false;
  const instant = now.getTime();
  if (update.visible_from && Date.parse(update.visible_from) > instant) return false;
  if (update.visible_until && Date.parse(update.visible_until) <= instant) return false;
  return true;
}

export function localizePracticeUpdate<T extends {
  title_de: string; title_en: string; summary_de: string; summary_en: string; body_de: string; body_en: string;
}>(update: T, language: "de" | "en") {
  return {
    title: language === "en" ? update.title_en : update.title_de,
    summary: language === "en" ? update.summary_en : update.summary_de,
    body: language === "en" ? update.body_en : update.body_de,
  };
}
