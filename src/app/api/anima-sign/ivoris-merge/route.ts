import { NextResponse } from "next/server";
import { updateIvorisPatient } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 60;

// The 15 known duplicates from the preview - apply updates directly
const MERGES = [
  { name: "Ezaldeen Shtewe", origId: "4717fc52-b17a-403b-b8ba-a51c86bf222c", dupId: "410a6060-1152-4af7-9074-b46242088b34", update: { Email: "ferasferasshtewe@gmail.com", Phone: "01743982302", Mobile: "01743982302", Address: { Street: "Sommerfelderstraße 36", Zip: "", City: "" } } },
  { name: "Milana Trykolich", origId: "0c1ae849-9a0f-4bdf-ad3f-70b3d0d5f51d", dupId: "754c0636-ff97-4d8b-bfb4-c91ecb0784b9", update: { Email: "annetrikolich@gmail.com", Phone: "015566163839", Mobile: "015566163839" } },
  { name: "Johanna Döhler", origId: "05d706d3-31a5-4fcc-8fbf-4244faea9afb", dupId: "73731345-1191-4bb9-a8a9-59b216067e3b", update: { Phone: "015735481333", Mobile: "015735481333" } },
  { name: "Fiona Müller", origId: "930220d6-ac23-42e6-8ef4-5f5c9c9d9f70", dupId: "c801f31b-90cb-4c58-98dc-079a527a593e", update: { Phone: "017630328757", Mobile: "017630328757", Address: { Street: "Humboldtstraße 10", Zip: "", City: "" } } },
  { name: "Lilian Stephan", origId: "7b5b3e91-2bc3-4f4f-bac3-00d3913e964d", dupId: "7493764d-7004-4276-a4f8-0d07a88c66d6", update: { Phone: "0176 22272251", Mobile: "+49 176 22272251" } },
  { name: "Lars Goldhardt", origId: "484255a1-b6dd-4c1f-a609-92778b17b77b", dupId: "1aa80a58-26a5-4d22-8f42-76c88a3f6424", update: { Phone: "+49 174 4821470", Mobile: "+49 174 4821470" } },
  { name: "Sumea Kodrali", origId: "70237b11-b885-43b9-af0c-a193fa5c90e9", dupId: "72a427d2-7a82-4e18-8493-0650ffbb76c3", update: { Address: { Street: "Teichstr. 37", Zip: "", City: "" } } },
  { name: "Tymofii Opanasenko", origId: "67d7cc0e-e513-45e0-a6ef-89df240b83d3", dupId: "e5bcd242-707c-4270-9dbd-70b2475c993b", update: { Phone: "+49 160 5006650", Mobile: "+49 160 5006650" } },
  { name: "Mya Bollmann", origId: "b452036e-4ebf-4b27-982d-f3113553cebb", dupId: "4c5396a2-a0a7-4aea-ba63-01fcd53f5c46", update: { Phone: "+49 1517 3053704", Mobile: "+49 1517 3053704" } },
  { name: "Emilia Lehmann", origId: "47a844d3-0547-49c9-8f83-df7dded25e06", dupId: "b7353da5-ff6c-4acd-aa32-0a94da913523", update: { Mobile: "+49 1578 5090041" } },
  { name: "Malak Aljadoua", origId: "e81c661c-cff1-40f5-acf5-261526717c9e", dupId: "81de5663-a7e0-4d76-ae89-758aca6e00b3", update: { Phone: "+49 179 4434434", Mobile: "+49 179 4434434" } },
  { name: "David Ngo", origId: "a59d74c2-d33b-4772-a6e6-37a840261d6d", dupId: "a292dd90-a7c9-49dc-ba82-6fe7cbca2b79", update: { Email: "ngothiloan0104@gmail.com", Phone: "01724976789", Mobile: "01724976789" } },
  { name: "Tammo Kornelson", origId: "8239963f-1200-4f25-8bab-77ba3d2429eb", dupId: "df98fe8e-b89e-408e-9e14-7b75d6553575", update: { Email: "tammokornelson@gmail.com", Mobile: "017697573725", Address: { Street: "Paul-Heyse-Strasse 41", Zip: "04347", City: "" } } },
  { name: "Leonor Moro Gámez", origId: "ad9041de-2190-4eda-ac30-75f8ed7660d2", dupId: "a15d1b67-81a1-4a00-bd53-ea020acdd267", update: { Phone: "+34 608 13 35 50", Mobile: "+34 608 13 35 50" } },
  { name: "Lisa Werkmeister", origId: "c6c7e9e0-136c-49b6-b441-c69f96894dc2", dupId: "45877b2c-cf32-45c3-b2d7-e5ff2434538f", update: { Email: "lisa_werkmeister@icloud.com", Phone: "01759951117", Mobile: "01759951117" } },
];

export async function GET() {
  const results: Array<{ name: string; status: string; dupId: string }> = [];

  for (const m of MERGES) {
    try {
      // Filter out empty Address fields
      const cleanUpdate: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m.update)) {
        if (k === "Address") {
          const addr = v as Record<string, string>;
          const nonEmpty: Record<string, string> = {};
          for (const [ak, av] of Object.entries(addr)) {
            if (av) nonEmpty[ak] = av;
          }
          if (Object.keys(nonEmpty).length > 0) cleanUpdate.Address = nonEmpty;
        } else if (v) {
          cleanUpdate[k] = v;
        }
      }

      await updateIvorisPatient(m.origId, cleanUpdate);
      results.push({ name: m.name, status: "OK - Original aktualisiert", dupId: m.dupId });
    } catch (e) {
      results.push({ name: m.name, status: "FEHLER: " + String(e).slice(0, 100), dupId: m.dupId });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({
    merged: results.length,
    results,
    sabineAktion: "Bitte folgende Duplikat-IDs in Ivoris loeschen:",
    zuLoeschen: MERGES.map(m => ({ name: m.name, ivorisId: m.dupId })),
  });
}
