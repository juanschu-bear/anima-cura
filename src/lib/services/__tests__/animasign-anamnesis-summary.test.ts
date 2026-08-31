import assert from "node:assert/strict";
import test from "node:test";
import { buildAnamnesisSummaryText } from "../animasign-anamnesis-summary";

test("buildAnamnesisSummaryText includes core intake data and positive findings", () => {
  const text = buildAnamnesisSummaryText({
    vorname: "Alexandra",
    nachname: "Kurth",
    geburtsdatum: "2015-09-18",
    created_at: "2026-08-20T14:40:41.474839+00:00",
    signiert_am: "2026-08-20T15:01:21.965678+00:00",
    answers: {
      patient_geburtsdatum: "2015-09-18",
      besuchsgrund: "Kieferorthopäde Tochter",
      versicherungsart: "Gesetzlich versichert",
      krankenkasse: "AOK Plus",
      zusatzversicherung: true,
      zusatzversicherung_welche: "Dkv",
      vp_anrede: "Frau",
      vp_vorname: "Nicole",
      vp_nachname: "Kurth",
      vp_telefon: "017630765510",
      vp_email: "nicole.kurth@gmx.de",
      g_hno: "ja",
      g_knirschen: "ja",
      g_atmung: "Nase",
      g_zaehneputzen: "2× täglich",
      g_allergien: "nein",
    },
  });

  assert.match(text, /Digitaler Anamnesebogen eingegangen/);
  assert.match(text, /Patient: Alexandra Kurth/);
  assert.match(text, /Besuchsgrund: Kieferorthopäde Tochter/);
  assert.match(text, /Versicherung: Gesetzlich versichert · AOK Plus · Zusatzversicherung \(Dkv\)/);
  assert.match(text, /Versicherte Person: Frau Nicole Kurth/);
  assert.match(text, /Medizinische Hinweise: .*HNO-Behandlung.*Naechtliches Zaehneknirschen.*Atmung: Nase/);
  assert.match(text, /Kontaktdaten und Versicherungsdaten wurden zur Stammdatenuebernahme uebergeben\./);
  assert.doesNotMatch(text, /Kontakt:/);
  assert.doesNotMatch(text, /Zaehneputzen:/);
  assert.doesNotMatch(text, /Allergien \/ Unvertraeglichkeiten/);
});
