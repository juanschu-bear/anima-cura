/**
 * Vorbereitete Beiträge „Neu in Anima Cura“. Jedes Update, das die Praxis bemerkt, bringt seinen Text hier mit
 * (Juans Entscheidung, 11.11.2026). Juans Glocke meldet jeden Beitrag, dessen slug noch nicht veröffentlicht ist;
 * erst sein Tipp auf „Veröffentlichen“ schickt ihn an die Praxis. Neue Beiträge oben anfügen, slug nie ändern.
 */
/** Entwurf einer Neuigkeit für die Praxis. Englisch ist optional; leer gelassen gilt der deutsche Text. */
export type Entwurf = { titel: string; kurz: string; text: string; titelEn: string; kurzEn: string; textEn: string; art: "neuerung" | "wichtig" | "hinweis"; bestaetigen: boolean; slug?: string };
export const LEERER_ENTWURF: Entwurf = { titel: "", kurz: "", text: "", titelEn: "", kurzEn: "", textEn: "", art: "neuerung", bestaetigen: false };
const NICHTS_GEHT_VERLOREN: Entwurf = {
  slug: "2026-11-11-nichts-geht-verloren",
  art: "neuerung",
  bestaetigen: false,
  titel: "Nichts geht mehr verloren",
  kurz: "Fällt das Netz kurz aus oder läuft die Anmeldung ab, bleibt alles stehen, und Scribe sagt sofort, wie es weitergeht.",
  text: [
    "1. Netz kurz weg",
    "Scribe versucht es automatisch noch einmal. Klappt es trotzdem nicht, steht dort in einem Satz, was zu tun ist. Alles Eingetippte bleibt stehen, und kein Knopf bleibt hängen.",
    "",
    "2. Anmeldung abgelaufen",
    "Ein Anmeldefenster legt sich über die offene Seite. Nach der Anmeldung geht es genau dort weiter, wo du warst.",
    "",
    "3. Klare Hinweise statt Technik",
    "Statt technischer Meldungen sagt Scribe, was los ist und was du jetzt selbst tun kannst.",
    "",
    "4. Kein doppelter Eintrag",
    "Ist eine Bestätigung angekommen, obwohl das Netz kurz weg war, erkennt Scribe das und zeigt den Eintrag als eingetragen. Er wird nicht noch einmal als Nachtrag ergänzt.",
  ].join("\n"),
  titelEn: "Nothing gets lost anymore",
  kurzEn: "If the connection drops or your sign-in expires, everything stays in place and Scribe tells you right away how to continue.",
  textEn: [
    "1. Connection briefly gone",
    "Scribe tries again automatically. If it still does not work, one sentence tells you what to do. Everything you typed stays in place and no button gets stuck.",
    "",
    "2. Sign-in expired",
    "A sign-in window appears over the open page. After signing in, you continue exactly where you were.",
    "",
    "3. Clear hints instead of technical messages",
    "Instead of technical messages, Scribe says what is going on and what you can do yourself right now.",
    "",
    "4. No duplicate entry",
    "If a confirmation arrived even though the connection was briefly gone, Scribe recognizes it and shows the entry as recorded. It is not added again as a supplement.",
  ].join("\n"),
};
const BAUSTEINE_GLOCKE_INFOBOX: Entwurf = {
  slug: "2026-11-11-bausteine-selbst-aendern",
  art: "neuerung",
  bestaetigen: false,
  titel: "Bausteine selbst ändern, mit Rückgängig",
  kurz: "Ihr könnt Bausteine jetzt selbst umbenennen und ausblenden. Jede Änderung lässt sich rückgängig machen. Dazu neu: diese Glocke und ein klarer Stand in der Infobox.",
  text: [
    "1. Bausteine selbst ändern",
    "An jeder Gruppe steht oben rechts „✎ Bausteine“. Dort könnt ihr Bausteine umbenennen, ausblenden und wieder einblenden, auch feste Bausteine wie „Br … wieder geklebt“. Gespeicherte Einträge bleiben dabei, wie sie sind.",
    "",
    "2. Alles lässt sich rückgängig machen",
    "Im Änderungsbuch steht jede Änderung mit Zeit und Name. Ein Tipp auf „Rückgängig“ holt den alten Stand zurück. Das × an euren eigenen Texten blendet sie jetzt nur aus, direkt danach erscheint „Rückgängig“. Früher gelöschte eigene Texte findet ihr im Änderungsbuch unter „Gelöschte eigene Texte“ und holt sie mit „Zurückholen“ wieder.",
    "",
    "3. Gruppen mit Abrechnung bleiben geschützt",
    "Bei Gruppen, an denen die Abrechnung hängt, geht Ändern nur über „Wunsch an Juan“. Der Knopf öffnet die Infobox mit vorbereitetem Text.",
    "",
    "4. Die Glocke",
    "Hier oben seht ihr, wenn sich bei euren Einträgen in der Infobox etwas tut oder es Neues in Anima Cura gibt. Ist etwas Neues da, wird die Glocke orange.",
    "",
    "5. Infobox mit klarem Stand",
    "Jeder Eintrag zeigt seinen Weg: Eingetragen, Wird angeschaut, Wird umgesetzt, Fertig bitte prüfen, Von der Praxis abgehakt. Steht er auf „Fertig, bitte prüfen“, hakt ihr ihn mit „Abhaken, passt so“ ab.",
    "",
    "6. Neue Kopfzeile",
    "„Passwort“ und „Demo“ findet ihr jetzt oben rechts unter „⋯“. Aus „Mitarbeiter wechseln“ ist „Wechseln“ geworden, direkt neben eurem Namen. Hell und Dunkel schaltet ihr über das Sonnen- oder Mond-Symbol.",
  ].join("\n"),
  titelEn: "Edit text blocks yourself, with undo",
  kurzEn: "You can now rename and hide text blocks yourself. Every change can be undone. Also new: this bell and a clear status in the inbox.",
  textEn: [
    "1. Edit text blocks yourself",
    "Each group has a \"✎ Blocks\" button at the top right. There you can rename, hide and show text blocks again, including fixed blocks. Saved entries stay as they are.",
    "",
    "2. Everything can be undone",
    "The change log lists every change with time and name. \"Undo\" brings back the previous state. The × on your own texts now only hides them, with \"Undo\" right after. Previously deleted own texts are listed in the change log under \"Deleted own texts\" and come back with \"Restore\".",
    "",
    "3. Groups tied to billing stay protected",
    "For groups that drive billing, changes go through \"Request to Juan\". The button opens the inbox with a prepared text.",
    "",
    "4. The bell",
    "Up here you see when something happens with your inbox entries or when there is news in Anima Cura. When something is new, the bell turns orange.",
    "",
    "5. Inbox with a clear status",
    "Each entry shows its path: Submitted, Being reviewed, Being implemented, Done please check, Checked off by the practice. When it says \"Done, please check\", check it off with \"Check off, all good\".",
    "",
    "6. New header",
    "\"Password\" and \"Demo\" are now under \"⋯\" at the top right. \"Switch staff member\" is now \"Switch\", right next to your name. Light and dark are toggled with the sun or moon icon.",
  ].join("\n"),
};

export const VORBEREITETE_NEUIGKEITEN: Entwurf[] = [NICHTS_GEHT_VERLOREN, BAUSTEINE_GLOCKE_INFOBOX];
