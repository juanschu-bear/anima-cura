import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const filename of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals < 1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, equals).trim();
    if (!(key in process.env)) process.env[key] = line.slice(equals + 1).trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase-Konfiguration fehlt");
const db = createClient(url, key);

const TRANSACTION_IDS = [
  "a5bf5bf3-62f7-45f6-82d1-5489ccf7c674",
  "4d1870ff-17c4-4acc-873f-51e05c48fd38",
  "ff781fd1-3576-435d-ba1d-2c9e7a100774",
  "62e1bf8e-9df0-4e6c-8040-1d272d1698ef",
  "80680886-5320-41c6-afe9-91379db26a18",
  "c97c0f1d-79b0-433e-b023-85e0726d1cef",
  "18e31e50-e8b1-4732-aff3-2e25722c42e0",
  "da2faebb-5152-45d0-a237-387d11fcb5ee",
  "cbc54661-762a-48e3-ba3e-c558b8b79c36",
  "f6d5c2c5-ac3c-4fd8-be89-4dd13ac40ed3",
  "23984542-04ac-4225-8713-f442cb55c441",
] as const;

const RATE_REPAIRS = [
  {
    id: "d348f3a6-34c4-4ec7-a322-9878c155c281",
    expectedPaid: 225,
    paid: 99.88,
    transactionId: "fabd3090-8484-4a8b-8069-5cdbb62b2b68",
  },
  {
    id: "45fd61e8-0d2a-4e91-93ba-5778b86f1023",
    expectedPaid: 129.16,
    paid: 99.76,
    transactionId: "3230623b-9688-4d4b-8562-943748db08f2",
  },
  {
    id: "db04c4ff-0b3e-425f-ac59-55ae00f6c5fe",
    expectedPaid: 250,
    paid: 135.62,
    transactionId: "de6caca0-1144-4ea6-85ac-a5f83b68063f",
  },
  {
    id: "32012f53-5f69-4d73-9ba4-ffb03adfc226",
    expectedPaid: 22.57,
    paid: 0,
    transactionId: null,
  },
] as const;

function explicitPatientNumber(text: string | null) {
  const matches = String(text || "").match(/(?<!\d)\d{8}(?!\d)/g) || [];
  // The first 8-digit number may be an invoice number. A known patient number
  // is resolved against patients below instead of guessed by position.
  return Array.from(new Set(matches));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [{ data: transactions, error: transactionError }, { data: rates, error: rateError }] = await Promise.all([
    db.from("transaktionen").select("*").in("id", [...TRANSACTION_IDS]),
    db.from("raten").select("*").in("id", RATE_REPAIRS.map((row) => row.id)),
  ]);
  if (transactionError || rateError) throw transactionError || rateError;
  if (transactions?.length !== TRANSACTION_IDS.length) throw new Error("Nicht alle erwarteten Bankumsätze gefunden");
  if (rates?.length !== RATE_REPAIRS.length) throw new Error("Nicht alle erwarteten Raten gefunden");

  const referencedNumbers = Array.from(new Set(transactions.flatMap((row) => explicitPatientNumber(row.verwendungszweck))));
  const { data: patients, error: patientError } = await db
    .from("patients")
    .select("id, ivoris_nummer, vorname, nachname")
    .in("ivoris_nummer", referencedNumbers);
  if (patientError) throw patientError;
  const patientsByNumber = new Map((patients || []).map((row) => [row.ivoris_nummer, row]));

  const corrections = transactions.map((transaction) => {
    const candidates = explicitPatientNumber(transaction.verwendungszweck)
      .map((number) => patientsByNumber.get(number))
      .filter(Boolean);
    if (candidates.length !== 1) throw new Error(`Bankumsatz ${transaction.id}: Patientennummer nicht eindeutig`);
    const target = candidates[0]!;
    if (target.id === transaction.matched_patient_id) throw new Error(`Bankumsatz ${transaction.id}: bereits richtig zugeordnet`);
    return { transaction, target };
  });

  for (const repair of RATE_REPAIRS) {
    const rate = rates.find((row) => row.id === repair.id);
    if (!rate || Number(rate.bezahlt_betrag || 0) !== repair.expectedPaid) {
      throw new Error(`Rate ${repair.id}: Ist-Zustand hat sich geändert; Abbruch ohne Änderung`);
    }
  }

  const preview = {
    apply,
    corrections: corrections.map(({ transaction, target }) => ({
      transactionId: transaction.id,
      amount: transaction.betrag,
      fromPatientId: transaction.matched_patient_id,
      toPatientId: target.id,
      patientNumber: target.ivoris_nummer,
      patient: `${target.vorname} ${target.nachname}`,
    })),
    rateRepairs: RATE_REPAIRS,
  };
  if (!apply) return console.log(JSON.stringify(preview, null, 2));

  const backupFile = `/tmp/anima-explicit-number-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backupFile, JSON.stringify({ transactions, rates }, null, 2), { mode: 0o600 });
  const stamp = new Date().toISOString();

  for (const repair of RATE_REPAIRS) {
    const current = rates.find((row) => row.id === repair.id)!;
    const { data: updated, error } = await db.from("raten").update({
      bezahlt_betrag: repair.paid || null,
      status: repair.paid > 0 ? "teilbezahlt" : (new Date(current.faellig_am) < new Date() ? "überfällig" : "offen"),
      bezahlt_am: null,
      transaktion_id: repair.transactionId,
    }).eq("id", repair.id).eq("bezahlt_betrag", repair.expectedPaid).select("id");
    if (error || updated?.length !== 1) throw error || new Error(`Rate ${repair.id} nicht aktualisiert`);
  }

  for (const { transaction, target } of corrections) {
    const details = transaction.matching_details && typeof transaction.matching_details === "object"
      ? transaction.matching_details
      : {};
    const { data: updated, error } = await db.from("transaktionen").update({
      matched_patient_id: target.id,
      matched_rate_id: null,
      matching_status: "auto",
      matching_score: 100,
      matching_details: {
        ...details,
        methode: "patientennummer_korrektur",
        basisnummer: target.ivoris_nummer,
        previous_patient_id: transaction.matched_patient_id,
        previous_rate_id: transaction.matched_rate_id,
        corrected_at: stamp,
        booking_mode: "keine_offenen_forderungen",
        booking_applied_at: stamp,
      },
      geprueft_am: stamp,
    }).eq("id", transaction.id).eq("matched_patient_id", transaction.matched_patient_id).select("id");
    if (error || updated?.length !== 1) throw error || new Error(`Bankumsatz ${transaction.id} nicht aktualisiert`);
  }

  console.log(JSON.stringify({ applied: true, backupFile, corrected: corrections.length, repairedRates: RATE_REPAIRS.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
