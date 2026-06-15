// ============================================================
// Praxis-Konten anlegen/aktualisieren (ohne Hostinger, ohne Postfaecher)
//
// Was es tut:
//   1. doctora@praxis-schubert.de  -> Dr. Maria Elena Schubert, Rolle admin,      Kuerzel ms
//   2. sabine@praxis-schubert.de   -> Sabine Rueger,            Rolle verwaltung, Kuerzel sr
//   Existiert das Konto: E-Mail/Name/Rolle/Kuerzel werden aktualisiert.
//   Existiert es nicht: es wird mit bestaetigter E-Mail angelegt (kein Postfach noetig).
//
// Aufruf (im Repo-Root, liest .env.local):
//   node scripts/praxis-accounts.mjs
//
// Optional per Umgebungsvariable:
//   DOCTORA_ALTE_EMAIL=alte@adresse.de   -> bestehendes Konto von Dr. Schubert wird
//                                           auf doctora@praxis-schubert.de umgezogen
//   PRAXIS_PASSWORT=...                  -> Passwort fuer Praxis-Konten
//                                           (bestehende Konten werden damit ebenfalls aktualisiert)
//
// Hinweis: "Passwort vergessen" per Mail funktioniert bei diesen Adressen nicht
// (kein Postfach). Passwort-Resets laufen ueber dieses Script bzw. das Supabase-Dashboard.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

function ladeEnvLocal() {
  try {
    for (const zeile of readFileSync(".env.local", "utf8").split("\n")) {
      const m = zeile.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env.local optional, Variablen koennen auch direkt gesetzt sein */
  }
}
ladeEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (in .env.local oder als Umgebungsvariable).");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const STANDARD_PRAXIS_PASSWORT = process.env.PRAXIS_PASSWORT || "ms13sr06?!";

const KONTEN = [
  {
    email: "doctora@praxis-schubert.de",
    alteEmail: process.env.DOCTORA_ALTE_EMAIL || null,
    fullName: "Dr. Maria Elena Schubert",
    kuerzel: "ms",
    role: "admin",
    passwort: STANDARD_PRAXIS_PASSWORT,
  },
  {
    email: "sabine@praxis-schubert.de",
    alteEmail: null,
    fullName: "Sabine Rüger",
    kuerzel: "sr",
    role: "verwaltung",
    passwort: STANDARD_PRAXIS_PASSWORT,
  },
];

async function findeUser(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const treffer = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (treffer) return treffer;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

function neuesPasswort(vorgegebenesPasswort) {
  return vorgegebenesPasswort || randomBytes(9).toString("base64url");
}

async function sichern(konto) {
  let user = await findeUser(konto.email);
  const zielPasswort = konto.passwort || process.env.PRAXIS_PASSWORT || null;

  if (!user && konto.alteEmail) {
    const alt = await findeUser(konto.alteEmail);
    if (alt) {
      const { data, error } = await admin.auth.admin.updateUserById(alt.id, {
        email: konto.email,
        email_confirm: true,
        user_metadata: { ...alt.user_metadata, full_name: konto.fullName, display_name: konto.fullName },
      });
      if (error) throw error;
      user = data.user;
      console.log(`UMGEZOGEN  ${konto.alteEmail} -> ${konto.email}`);
    }
  }

  let passwortHinweis = "(unveraendert)";
  if (!user) {
    const passwort = neuesPasswort(zielPasswort);
    const { data, error } = await admin.auth.admin.createUser({
      email: konto.email,
      password: passwort,
      email_confirm: true,
      user_metadata: { full_name: konto.fullName, display_name: konto.fullName },
    });
    if (error) throw error;
    user = data.user;
    passwortHinweis = `NEU: ${passwort}`;
    console.log(`ANGELEGT   ${konto.email}`);
  } else {
    const updatePayload = {
      user_metadata: { ...user.user_metadata, full_name: konto.fullName, display_name: konto.fullName },
    };
    if (zielPasswort) {
      updatePayload.password = zielPasswort;
      passwortHinweis = `GESETZT: ${zielPasswort}`;
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, updatePayload);
    if (error) throw error;
    console.log(`VORHANDEN  ${konto.email}`);
  }

  // Produktive Tabelle: id, email, display_name (NOT NULL), role, created_at, patient_id, kuerzel
  const { error: profilFehler } = await admin
    .from("user_profiles")
    .upsert(
      {
        id: user.id,
        email: konto.email,
        display_name: konto.fullName,
        role: konto.role,
        kuerzel: konto.kuerzel,
      },
      { onConflict: "id" }
    );
  if (profilFehler) throw profilFehler;

  return { email: konto.email, rolle: konto.role, kuerzel: konto.kuerzel, passwort: passwortHinweis };
}

const ergebnis = [];
for (const konto of KONTEN) {
  ergebnis.push(await sichern(konto));
}
console.log("\n=== Zusammenfassung ===");
console.table(ergebnis);
console.log("Patienten-Konten folgen separat mit @animacura.io (Patientenportal).");
