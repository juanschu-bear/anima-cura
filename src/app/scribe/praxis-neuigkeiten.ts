/**
 * Vorbereitete Beiträge „Neu in Anima Cura“. Jedes Update, das die Praxis bemerkt, bringt seinen Text hier mit
 * (Juans Entscheidung, 11.11.2026). Juans Glocke meldet jeden Beitrag, dessen slug noch nicht veröffentlicht ist;
 * erst sein Tipp auf „Veröffentlichen“ schickt ihn an die Praxis. Neue Beiträge oben anfügen, slug nie ändern.
 */
/** Entwurf einer Neuigkeit für die Praxis. Englisch ist optional; leer gelassen gilt der deutsche Text. */
export type Entwurf = { titel: string; kurz: string; text: string; titelEn: string; kurzEn: string; textEn: string; art: "neuerung" | "wichtig" | "hinweis"; bestaetigen: boolean; slug?: string };
export const LEERER_ENTWURF: Entwurf = { titel: "", kurz: "", text: "", titelEn: "", kurzEn: "", textEn: "", art: "neuerung", bestaetigen: false };
const ZEITMASCHINE_ABSICHERUNG: Entwurf = {
  slug: "2026-11-11-zeitmaschine-absicherung",
  art: "hinweis",
  bestaetigen: false,
  titel: "Vorlagen und alte Einträge bleiben verlässlich",
  kurz: "Eine Vorlage, die geprüft werden muss, blockiert nicht mehr alle anderen. Alte bestätigte Einträge behalten ihren damaligen Stand.",
  text: [
    "1. Eine einzelne Vorlage blockiert Scribe nicht mehr",
    "Passt eine Vorlage einmal nicht zu ihrem gespeicherten Stand, bleiben alle anderen Vorlagen benutzbar. Nur die betroffene Vorlage wird zur Prüfung zurückgehalten.",
    "",
    "2. Alte bestätigte Einträge behalten ihren damaligen Stand",
    "Wenn ein Baustein später umbenannt oder ausgeblendet wird, lassen sich die Positionen eines früher bestätigten Eintrags weiterhin verwenden. Für die Prüfung zählt der Stand bei der damaligen Bestätigung.",
    "",
    "3. Keine Glocke für die eigene Aktion",
    "Wer den eigenen Eintrag kommentiert oder selbst abschließend bestätigt, bekommt dafür keine Benachrichtigung an sich selbst.",
  ].join("\n"),
  titelEn: "Templates and older entries remain reliable",
  kurzEn: "One template that needs review no longer blocks all others. Older confirmed entries retain their original state.",
  textEn: [
    "1. One template no longer blocks Scribe",
    "If a template does not match its saved state, all other templates remain available. Only the affected template is held for review.",
    "",
    "2. Older confirmed entries retain their original state",
    "If a block is renamed or hidden later, the service lines from an earlier confirmed entry can still be used. The review uses the state at the time of confirmation.",
    "",
    "3. No bell notification for your own action",
    "If you comment on your own entry or complete its final practice confirmation yourself, you do not receive a notification about your own action.",
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

export const VORBEREITETE_NEUIGKEITEN: Entwurf[] = [ZEITMASCHINE_ABSICHERUNG, BAUSTEINE_GLOCKE_INFOBOX];
