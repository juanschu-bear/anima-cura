// Anamnesebogen der KFO-Praxis Dr. Schubert.
// Quelle: freigegebenes Mockup (Variante A), Einwilligungs-Split gemaess Rechts-Recherche.
// Wird von SurveyJS (survey-core) gerendert. Struktur und Logik, nicht das Theme.
/* eslint-disable */
export const anamneseFormJson = {
  "title": "Anamnesebogen",
  "description": "KFO-Praxis Dr. Schubert · Kieferorthopädie",
  "locale": "de",
  "showQuestionNumbers": "off",
  "showProgressBar": "top",
  "progressBarType": "pages",
  "widthMode": "responsive",
  "pageNextText": "Weiter",
  "pagePrevText": "Zurück",
  "completeText": "Absenden",
  "completedHtml": "<h3>Vielen Dank!</h3><p>Ihr Bogen ist eingegangen. Sie erhalten Ihre unterschriebenen Unterlagen per E-Mail, und unsere Praxis hat alles vorliegen. In der Anima Cura App haben Sie alles jederzeit griffbereit.</p>",
  "pages": [
    {
      "name": "versicherung",
      "title": "Versicherung",
      "description": "Ein paar Angaben zur Krankenversicherung.",
      "elements": [
        {
          "type": "radiogroup",
          "name": "versicherungsart",
          "title": "Versicherungsart",
          "isRequired": true,
          "choices": ["Gesetzlich versichert", "Privat versichert", "Beihilfe", "Selbstzahler"]
        },
        {
          "type": "text",
          "name": "krankenkasse",
          "title": "Krankenkasse",
          "placeholder": "z. B. AOK, TK …",
          "isRequired": true
        },
        {
          "type": "boolean",
          "name": "zusatzversicherung",
          "title": "Zusatzversicherung?",
          "labelTrue": "Ja",
          "labelFalse": "Nein"
        },
        {
          "type": "text",
          "name": "zusatzversicherung_welche",
          "title": "Welche Zusatzversicherung?",
          "placeholder": "Bezeichnung der Zusatzversicherung",
          "visibleIf": "{zusatzversicherung} = true"
        }
      ]
    },
    {
      "name": "patient",
      "title": "Angaben zum Patienten",
      "description": "Wer wird bei uns behandelt?",
      "elements": [
        { "type": "text", "name": "patient_vorname", "title": "Vorname", "isRequired": true },
        { "type": "text", "name": "patient_nachname", "title": "Nachname", "isRequired": true, "startWithNewLine": false },
        {
          "type": "text",
          "name": "patient_geburtsdatum",
          "title": "Geburtsdatum",
          "inputType": "date",
          "isRequired": true,
          "description": "Daraus richten wir den Bogen automatisch passend für Sie ein."
        },
        {
          "type": "dropdown",
          "name": "patient_geschlecht",
          "title": "Geschlecht",
          "isRequired": true,
          "choices": ["Männlich", "Weiblich", "Divers"]
        },
        { "type": "text", "name": "patient_telefon", "title": "Telefonnummer", "inputType": "tel", "isRequired": true, "startWithNewLine": false },
        { "type": "text", "name": "patient_strasse", "title": "Straße", "isRequired": true },
        { "type": "text", "name": "patient_hausnummer", "title": "Hausnummer", "isRequired": true, "startWithNewLine": false },
        { "type": "text", "name": "patient_plz", "title": "PLZ", "isRequired": true },
        { "type": "text", "name": "patient_wohnort", "title": "Wohnort", "isRequired": true, "startWithNewLine": false },
        {
          "type": "text",
          "name": "patient_email",
          "title": "E-Mail-Adresse",
          "inputType": "email",
          "isRequired": true,
          "description": "Für Terminerinnerungen und Ihre Unterlagen.",
          "validators": [{ "type": "email" }]
        },
        { "type": "text", "name": "patient_mobil", "title": "Mobilnummer", "inputType": "tel", "isRequired": true },
        { "type": "text", "name": "patient_beruf", "title": "Beruf", "startWithNewLine": false }
      ]
    },
    {
      "name": "versicherter",
      "title": "Versicherte Person & Erziehungsberechtigte",
      "description": "Da der Patient minderjährig ist, brauchen wir die Angaben der erziehungsberechtigten Person.",
      "visibleIf": "age({patient_geburtsdatum}) < 18",
      "elements": [
        {
          "type": "html",
          "name": "hinweis_minderjaehrig",
          "html": "<div style='padding:12px 14px;border-radius:12px;background:rgba(15,138,114,0.10);font-size:13px;'>Dieser Schritt erscheint nur, weil der Patient laut Geburtsdatum unter 18 ist. Bei Volljährigen entfällt er.</div>"
        },
        { "type": "text", "name": "vp_vorname", "title": "Vorname", "isRequired": true },
        { "type": "text", "name": "vp_nachname", "title": "Nachname", "isRequired": true, "startWithNewLine": false },
        { "type": "text", "name": "vp_geburtsdatum", "title": "Geburtsdatum", "inputType": "date" },
        { "type": "text", "name": "vp_telefon", "title": "Telefonnummer", "inputType": "tel", "isRequired": true, "startWithNewLine": false },
        { "type": "text", "name": "vp_strasse", "title": "Straße" },
        { "type": "text", "name": "vp_hausnummer", "title": "Hausnummer", "startWithNewLine": false },
        { "type": "text", "name": "vp_plz", "title": "PLZ" },
        { "type": "text", "name": "vp_wohnort", "title": "Wohnort", "startWithNewLine": false },
        { "type": "text", "name": "vp_email", "title": "E-Mail-Adresse", "inputType": "email", "validators": [{ "type": "email" }] },
        {
          "type": "boolean",
          "name": "vp2_vorhanden",
          "title": "Weitere(r) Erziehungsberechtigte(r)?",
          "labelTrue": "Ja",
          "labelFalse": "Nein"
        },
        {
          "type": "panel",
          "name": "vp2_panel",
          "visibleIf": "{vp2_vorhanden} = true",
          "elements": [
            { "type": "text", "name": "vp2_vorname", "title": "Vorname" },
            { "type": "text", "name": "vp2_nachname", "title": "Nachname", "startWithNewLine": false },
            { "type": "text", "name": "vp2_telefon", "title": "Telefonnummer", "inputType": "tel" },
            { "type": "text", "name": "vp2_email", "title": "E-Mail-Adresse", "inputType": "email", "startWithNewLine": false, "validators": [{ "type": "email" }] }
          ]
        }
      ]
    },
    {
      "name": "behandlung",
      "title": "Grund Ihres Besuchs",
      "description": "Erzählen Sie uns kurz, worum es geht, und welche Ärzte mitbehandeln.",
      "elements": [
        { "type": "comment", "name": "besuchsgrund", "title": "Grund Ihres Besuchs", "placeholder": "Was führt Sie zu uns?", "isRequired": true },
        { "type": "comment", "name": "zahnarzt", "title": "Behandelnder / überweisender Zahnarzt", "placeholder": "Name und Adresse" },
        { "type": "comment", "name": "hausarzt", "title": "Hausarzt", "placeholder": "Name und Adresse" }
      ]
    },
    {
      "name": "gesundheit",
      "title": "Gesundheitsfragen",
      "description": "Bitte für jede Frage Ja oder Nein wählen. Ehrliche Angaben helfen uns, sicher und richtig zu behandeln. Bei „Ja\" erscheint manchmal ein kurzes Zusatzfeld.",
      "elements": [
        { "type": "boolean", "name": "g_behandlung_aktuell", "title": "Ist der Patient zurzeit in ärztlicher Behandlung?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_behandlung_aktuell_welche", "title": "Wenn ja, wegen welcher Erkrankung?", "visibleIf": "{g_behandlung_aktuell} = true" },

        { "type": "boolean", "name": "g_erkrankungen", "title": "Bestehen allgemeine Erkrankungen (z. B. Asthma, Diabetes, Herzfehler, HIV, Hepatitis, Epilepsie)?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_erkrankungen_welche", "title": "Wenn ja, welche?", "visibleIf": "{g_erkrankungen} = true" },

        { "type": "boolean", "name": "g_medikamente", "title": "Werden regelmäßig Medikamente eingenommen?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_medikamente_welche", "title": "Wenn ja, welche?", "visibleIf": "{g_medikamente} = true" },

        { "type": "boolean", "name": "g_allergien", "title": "Allergien oder Unverträglichkeiten gegen Medikamente oder Materialien?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_allergien_welche", "title": "Wenn ja, welche?", "visibleIf": "{g_allergien} = true" },

        { "type": "boolean", "name": "g_physio", "title": "Wurde eine physiotherapeutische oder osteopathische Behandlung durchgeführt?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_hno", "title": "Bestand eine Behandlung bei einem HNO-Arzt?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },

        { "type": "radiogroup", "name": "g_atmung", "title": "Wird durch die Nase oder den Mund geatmet?", "isRequired": true, "choices": ["Nase", "Mund"] },

        { "type": "boolean", "name": "g_kfo_frueher", "title": "Gab es schon einmal eine kieferorthopädische Behandlung?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_op_mund", "title": "Operationen im Mund-/Kieferbereich (z. B. Lippenbändchen, Gaumenspalte)?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_kiefergelenk", "title": "Bestehen Kiefergelenkbeschwerden oder -knacken?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_kopfschmerzen", "title": "Häufige Kopf- oder Nackenschmerzen?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_knirschen", "title": "Nächtliches Zähneknirschen?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_logopaedie", "title": "Bestand eine logopädische Behandlung?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_unfaelle", "title": "Unfälle mit Beteiligung der Zähne oder des Kiefers?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },

        { "type": "boolean", "name": "g_lutschen", "title": "Lutschgewohnheit (Daumen, Finger, Schnuller), Lippen- oder Nägelbeißen?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_lutschen_beschreibung", "title": "Wenn ja, bitte beschreiben und in welchem Alter.", "visibleIf": "{g_lutschen} = true" },

        { "type": "boolean", "name": "g_geschwister_kfo", "title": "Sind Geschwister in kieferorthopädischer Behandlung?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },

        { "type": "boolean", "name": "g_instrument", "title": "Wird ein Musikinstrument gespielt?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "comment", "name": "g_instrument_welches", "title": "Wenn ja, welches?", "visibleIf": "{g_instrument} = true" },

        { "type": "boolean", "name": "g_roentgen_jahr", "title": "Im letzten Jahr im Kopf-/Kiefer-/Zahnbereich geröntgt?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },
        { "type": "boolean", "name": "g_schwangerschaft", "title": "Besteht zurzeit eine Schwangerschaft?", "labelTrue": "Ja", "labelFalse": "Nein", "isRequired": true },

        { "type": "radiogroup", "name": "g_zaehneputzen", "title": "Wie oft werden die Zähne geputzt?", "isRequired": true, "choices": ["1× täglich", "2× täglich", "3× oder öfter"] }
      ]
    },
    {
      "name": "einwilligungen",
      "title": "Ihre Einwilligungen",
      "description": "Bitte lesen und antippen, was Sie bestätigen möchten. Pflicht brauchen wir für die Behandlung. Freiwillig können Sie offenlassen.",
      "elements": [
        { "type": "boolean", "name": "ew_roentgen", "renderAs": "checkbox", "titleLocation": "hidden", "label": "Pflicht: Zustimmung zu notwendigen Röntgenuntersuchungen im Rahmen der KFO-Behandlung.", "isRequired": true },
        { "type": "html", "name": "hinweis_speicherung", "html": "<div style='padding:12px 14px;border-radius:12px;background:rgba(15,138,114,0.10);font-size:13px;'><b>Hinweis zum Datenschutz:</b> Ihre Daten verarbeiten wir auf Grundlage des Behandlungsvertrags, um Sie zu behandeln, abzurechnen und Termine mit Ihnen abzustimmen. Einzelheiten stehen in unserer Datenschutzerklärung. Dafür ist keine gesonderte Einwilligung nötig.</div>" },
        { "type": "boolean", "name": "ew_befunde", "renderAs": "checkbox", "titleLocation": "hidden", "label": "Freiwillig: Anforderung von Befunden anderer Ärzte und Weiterleitung an mitbehandelnde Ärzte." },
        { "type": "boolean", "name": "ew_epa", "renderAs": "checkbox", "titleLocation": "hidden", "label": "Freiwillig: Einstellen und Abrufen von Daten in die elektronische Patientenakte (ePA)." },
        { "type": "boolean", "name": "ew_digitale_rechnung", "renderAs": "checkbox", "titleLocation": "hidden", "label": "Freiwillig: Verzicht auf Papierrechnungen, Zustimmung zu digitalen Rechnungen.", "description": "Empfohlen: So liegen alle Rechnungen jederzeit digital in Ihrer Anima Cura App bereit." }
      ]
    },
    {
      "name": "abschluss",
      "title": "Abschluss & Unterschrift",
      "description": "Fast geschafft. Noch zwei Kleinigkeiten und Ihre Unterschrift.",
      "elements": [
        {
          "type": "radiogroup",
          "name": "aufmerksam_geworden",
          "title": "Wie sind Sie auf uns aufmerksam geworden?",
          "choices": ["Google-Suche", "Empfehlung", "Überweisung Zahnarzt", "Social Media", "Sonstiges"]
        },
        { "type": "text", "name": "abschluss_datum", "title": "Datum", "inputType": "date", "isRequired": true },
        { "type": "text", "name": "abschluss_ort", "title": "Ort", "isRequired": true, "startWithNewLine": false },
        { "type": "signaturepad", "name": "unterschrift_versicherter", "title": "Unterschrift des/der Versicherten", "isRequired": true },
        { "type": "signaturepad", "name": "unterschrift_vp2", "title": "Unterschrift des weiteren Erziehungsberechtigten", "visibleIf": "{vp2_vorhanden} = true" }
      ]
    }
  ]
}
;

export default anamneseFormJson;
