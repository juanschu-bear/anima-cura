import { NextRequest, NextResponse } from "next/server";
import type { Browser } from "playwright-core";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { canAccessPath } from "@/lib/auth";
import {
  buildReceiptPreviewHref,
  canRenderPatientReceipt,
  getReceiptFilename,
  loadKassenBeleg,
  parseReceiptFormat,
  parseReceiptVariant,
} from "@/lib/kasse-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function launchReceiptBrowser(): Promise<Browser> {
  if (process.platform === "darwin" || process.platform === "win32") {
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true });
  }

  const [{ chromium: playwrightChromium }, chromiumModule] = await Promise.all([
    import("playwright-core"),
    import("@sparticuz/chromium"),
  ]);

  const chromium = chromiumModule.default;

  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function ensureKasseAccess() {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as "admin" | "verwaltung" | "lesezugriff" | "patient" | undefined;
  if (!role || role === "patient" || !canAccessPath(role, "/kasse", profile?.permissions || null)) {
    return NextResponse.json({ error: "Keine Berechtigung für Kassenbelege" }, { status: 403 });
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await ensureKasseAccess();
  if (authError) return authError;

  const beleg = await loadKassenBeleg(params.id);
  if (!beleg) {
    return NextResponse.json({ error: "Beleg nicht gefunden" }, { status: 404 });
  }

  const format = parseReceiptFormat(request.nextUrl.searchParams.get("format"));
  const requestedVariant = parseReceiptVariant(request.nextUrl.searchParams.get("variant"));
  const variant = canRenderPatientReceipt(beleg) ? requestedVariant : "praxis";
  const disposition = request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  const targetUrl = new URL(
    buildReceiptPreviewHref(params.id, { variant, format, mode: "pdf" }),
    request.nextUrl.origin
  );

  let browser: Browser | null = null;

  try {
    browser = await launchReceiptBrowser();
    const context = await browser.newContext({ locale: "de-DE" });
    const cookies = request.cookies
      .getAll()
      .filter((cookie) => Boolean(cookie.value))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        url: request.nextUrl.origin,
      }));

    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle", timeout: 30000 });

    if (page.url().includes("/login")) {
      return NextResponse.json({ error: "Session abgelaufen. Bitte erneut anmelden." }, { status: 401 });
    }

    await page.emulateMedia({ media: "print" });
    await page.waitForSelector("[data-receipt-ready='true']", { timeout: 10000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    const pdf = await page.pdf({
      format: format === "a5" ? "A5" : "A4",
      printBackground: false,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${getReceiptFilename(beleg, variant)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF-Erzeugung fehlgeschlagen";
    return NextResponse.json(
      {
        error: "PDF konnte gerade nicht erzeugt werden.",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
