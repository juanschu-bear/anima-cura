import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (token !== "02712ec613d586400438e0bd289c1274") {
    return new NextResponse("not found", { status: 404 });
  }
  return NextResponse.json({
    ANIMASIGN_PDF_URL: process.env.ANIMASIGN_PDF_URL ?? null,
    ANIMASIGN_PDF_KEY: process.env.ANIMASIGN_PDF_KEY ?? null,
  });
}
