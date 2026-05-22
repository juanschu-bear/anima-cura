import { Resend } from "resend";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";

const PRACTICE_NAME = "Kieferorthopädische Praxis Dr. Maria Schubert";
const DEFAULT_FROM = "praxis@anima-cura.app";
const DEFAULT_IBAN = "DE XX XXXX XXXX XXXX XXXX XX";

const emailProviderSchema = z.object({
  provider: z.string().optional(),
  api_key: z.string().optional(),
  from: z.string().optional(),
});

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string;
  context?: Record<string, string>;
}

function replaceTemplateVars(text: string, context: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => context[key] || `{{${key}}}`);
}

async function readSettingValue(db: ReturnType<typeof createServerClient>, key: string): Promise<unknown> {
  const { data } = await db.from("einstellungen").select("value").eq("key", key).maybeSingle();
  return data?.value;
}

async function loadPraxisIban(db: ReturnType<typeof createServerClient>): Promise<string> {
  const value = await readSettingValue(db, "praxis_iban");

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (value && typeof value === "object" && "iban" in value) {
    const iban = (value as { iban?: unknown }).iban;
    if (typeof iban === "string" && iban.trim()) {
      return iban;
    }
  }

  return DEFAULT_IBAN;
}

async function logAudit(db: ReturnType<typeof createServerClient>, neueWerte: Record<string, unknown>) {
  await db.from("audit_log").insert({
    id: crypto.randomUUID(),
    tabelle: "email_send",
    datensatz_id: crypto.randomUUID(),
    aktion: "INSERT",
    neue_werte: neueWerte,
  });
}

export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  try {
    const rawProvider = await readSettingValue(db, "email_provider");
    const parsedProvider = emailProviderSchema.safeParse(rawProvider);
    const provider = parsedProvider.success ? parsedProvider.data : {};

    const apiKey = provider.api_key || process.env.RESEND_API_KEY;
    if (!apiKey) {
      const error = "Kein Resend-API-Key konfiguriert.";
      await logAudit(db, {
        status: "error",
        to: params.to,
        subject: params.subject,
        error,
      });
      return { ok: false, error };
    }

    const iban = await loadPraxisIban(db);
    const context = {
      praxis_name: PRACTICE_NAME,
      praxis_iban: iban,
      ...(params.context || {}),
    };

    const subject = replaceTemplateVars(params.subject, context);
    const body = replaceTemplateVars(params.body, context);
    const from = params.from || provider.from || DEFAULT_FROM;

    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html: body,
    });

    if (response.error) {
      const error = response.error.message || "E-Mail-Versand fehlgeschlagen.";
      await logAudit(db, {
        status: "error",
        provider: provider.provider || "resend",
        to: params.to,
        subject,
        error,
      });
      return { ok: false, error };
    }

    await logAudit(db, {
      status: "sent",
      provider: provider.provider || "resend",
      to: params.to,
      subject,
      from,
      resend_id: response.data?.id || null,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler beim E-Mail-Versand.";
    await logAudit(db, {
      status: "error",
      to: params.to,
      subject: params.subject,
      error: message,
    });
    return { ok: false, error: message };
  }
}
