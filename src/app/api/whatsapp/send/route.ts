import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";

const requestSchema = z.object({
  to: z.string().min(1, "Empfänger fehlt."),
  message: z.string().min(1, "Nachricht fehlt."),
  patientId: z.string().uuid().optional(),
});

const serviceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  endpoint: z.string().url().optional(),
});

const serviceResponseSchema = z.object({
  ok: z.boolean(),
  messageId: z.string().optional(),
});

async function logAudit(neueWerte: Record<string, unknown>) {
  const db = createServerClient();
  await db.from("audit_log").insert({
    id: crypto.randomUUID(),
    tabelle: "whatsapp_send",
    datensatz_id: crypto.randomUUID(),
    aktion: "INSERT",
    neue_werte: neueWerte,
  });
}

export async function POST(request: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    const parsedBody = requestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ungültige Anfrage.",
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const db = createServerClient();
    const { data: configRow } = await db
      .from("einstellungen")
      .select("value")
      .eq("key", "whatsapp_service")
      .maybeSingle();

    const parsedConfig = serviceConfigSchema.safeParse(configRow?.value);
    const config = parsedConfig.success ? parsedConfig.data : {};

    if (!config.enabled || !config.endpoint) {
      await logAudit({
        status: "whatsapp_pending",
        reason: "not_configured",
        to: parsedBody.data.to,
        patient_id: parsedBody.data.patientId || null,
      });

      return NextResponse.json({
        ok: false,
        reason: "not_configured",
      });
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: parsedBody.data.to,
        message: parsedBody.data.message,
      }),
    });

    const rawResult = await response.json().catch(() => null);
    const parsedResult = serviceResponseSchema.safeParse(rawResult);

    if (!response.ok || !parsedResult.success) {
      await logAudit({
        status: "error",
        to: parsedBody.data.to,
        patient_id: parsedBody.data.patientId || null,
        endpoint: config.endpoint,
        response_status: response.status,
        response_body: rawResult,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "WhatsApp-Service hat keine gültige Antwort geliefert.",
        },
        { status: 502 }
      );
    }

    await logAudit({
      status: parsedResult.data.ok ? "sent" : "error",
      to: parsedBody.data.to,
      patient_id: parsedBody.data.patientId || null,
      endpoint: config.endpoint,
      message_id: parsedResult.data.messageId || null,
    });

    return NextResponse.json(parsedResult.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter WhatsApp-Fehler.";
    await logAudit({
      status: "error",
      error: message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
