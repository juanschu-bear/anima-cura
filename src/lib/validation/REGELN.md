# Plausibilitaetspruefung der Formulare

Stand: dieser Baustein liegt in `src/lib/validation/feldpruefung.ts` und wird von allen
Formularen gemeinsam genutzt. Aktuell eingebaut im Anamnesebogen. Praxis-Pass und die
Login-Seiten folgen nach demselben Muster.

## Grundprinzip

Geprueft wird die **Form** einer Eingabe, nicht ihre **Echtheit**. Das System erkennt, ob eine
Angabe plausibel aussieht und kein offensichtlicher Muell ist. Ob eine Telefonnummer oder
E-Mail wirklich existiert und der Person gehoert, laesst sich nur ueber einen Rueckkanal
beweisen (SMS-Code, Bestaetigungsmail) und ist hier bewusst nicht enthalten.

## Wann die Pruefung greift

Erst beim Klick auf **Weiter** beziehungsweise **Absenden**, nicht waehrend des Tippens. Fehlt
oder stimmt etwas nicht, leuchtet genau das betroffene Feld rot auf, darunter steht ein kurzer
Grund, und oben erscheint ein Sammelhinweis. Man kommt erst weiter, wenn alles passt. Sobald ein
markiertes Feld bearbeitet wird, verschwindet seine Markierung sofort.

## Regeln pro Feldtyp

**Name (Vor- und Nachname).** Abgelehnt wird nur offensichtlicher Muell. Konkret: weniger als
zwei Buchstaben, enthaltene Ziffern, drei gleiche Zeichen am Stueck (zum Beispiel xxxxx), eine
Tastaturreihe (asdf, qwertz), oder drei im Alphabet aufeinanderfolgende Buchstaben (abc, das
faengt auch ABCZXYMO). Bewusst tolerant gehalten, damit Namen aller Herkuenfte durchgehen.
Geprueft und bestanden haben unter anderem Sczepanski, Nguyễn, Çağlar, Brzęczyszczykiewicz,
kyrillische und kurze asiatische Namen wie Ng oder Xu.

**E-Mail.** Genau ein @, davor und dahinter Text, die Domain enthaelt einen Punkt und eine Endung
mit mindestens zwei Zeichen. Faengt fehlendes @, leere Teile und reinen Text ohne Adresse.

**Telefon und Mobil.** Beginnt mit 0, 00 oder +. Danach nur Ziffern und uebliche Trennzeichen
(Leerzeichen, Schraegstrich, Klammern, Bindestrich). Gesamtzahl der Ziffern zwischen 7 und 15.

**PLZ.** Genau fuenf Ziffern, keine Buchstaben.

**Hausnummer.** Muss mindestens eine Ziffer enthalten.

**Geburtsdatum.** Gueltiges Datum, nicht in der Zukunft, Alter unter 120 Jahren.

**Datum (Abschluss).** Gueltiges Datum.

**Kurze Pflichttexte (Krankenkasse, Strasse, Wohnort, Ort).** Mindestens zwei Zeichen und bei
kurzer Eingabe kein Muell (gleiche obigen Muster).

**Freitext (Grund des Besuchs).** Nur Mindestlaenge, kein Muellfilter, weil Freitext beliebig
sein darf.

## Was bewusst NICHT geprueft wird

- **Echtheit** von Nummer oder Mail. Braucht einen externen Dienst oder Bestaetigungs-Rueckkanal
  und ist ein eigenes, spaeteres Thema.
- **Rechtschreibung von Namen.** Zu hohes Risiko, korrekte aber ungewoehnliche Namen faelschlich
  als Fehler zu markieren.

## Auswahl- und Pflichtfelder ohne Texteingabe

Versicherungsart, Geschlecht, die Ja-Nein- und Auswahlfragen, die Pflichteinwilligung und die
Unterschrift werden nur auf Vorhandensein geprueft. Fehlt die Auswahl, leuchtet die Gruppe rot.
