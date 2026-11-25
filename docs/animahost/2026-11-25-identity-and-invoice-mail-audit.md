# Zuordnung und Rechnungs-Mail – 25.11.2026

## Korrektur

Ein Vorname allein ist kein globaler Namensnachweis. Der Abgleich benötigt einen Vornamen und den vollständigen Nachnamen oder den vollständigen Nachnamen mit passendem Geburtsdatum. Ein isoliertes Geburtsdatum aus einer alten Kandidatenliste reicht ebenfalls nicht. Bereits gespeicherte vorläufige Vornamen-Treffer werden vor der Wiederverwendung neu geprüft. Unterschriften (auch „LG“) dürfen einen alten Treffer nicht ungeprüft übernehmen.

Vor der globalen Suche werden ausschließlich die zur Telefonnummer oder bestätigten Chatzuordnung gehörenden Patienten geladen: Hauptversicherte/Sorgeberechtigte, zweiter Sorgeberechtigter und aktive Rechnungsempfänger aus Behandlungsfällen sowie bestätigten Empfängerversionen. Eine passende Angehörigen-Unterschrift behält den zugehörigen Patienten und dessen Bestätigungsstatus. Der Name allein erteilt keine Freigabe; bei mehreren passenden Kindern bleibt die Zuordnung offen. Die schreibende Angehörige wird im Patientenblatt getrennt vom Patienten geführt. Mehrdeutige, keinem Kind zugeordnete Chatfälle bleiben bei Geschwistern gesperrt.

Der bekannte falsche vorläufige Link des heutigen Falls wurde über die bestehende Entscheidungsfunktion nachvollziehbar auf `released` gesetzt. Die korrekte bestätigte Telefonnummern-Verknüpfung blieb bestehen. Historische Entscheidungen werden nicht nachträglich umgeschrieben.

## Audit der letzten sieben Tage

Festes Prüfintervall: 18.11.2026 10:01:34 bis 25.11.2026 10:01:34 Berlin. 97 gespeicherte Entscheidungen; 46 mit Namensabgleich-/Patientenblatt-Protokoll, davon 34 `matched`. Zehn dieser Treffer stammen ausdrücklich aus der globalen Chat-Namenssuche (`source=chat`). Die übrigen stammen aus der Auswahl über die Telefonnummer.

Unter den globalen Namensabgleichen wurde genau **eine Entscheidung in einem Chat nur über den Vornamen** als `matched` gespeichert: Fall I01, 25.11.2026, 09:32 Uhr. `confirmed=false`, Patientenblatt `access=unconfirmed`, `fields={}`. **Keine vertraulichen Blattfelder waren geladen.**

Zusätzlich enthalten 24 Telefonnummern-Treffer nur den Vornamen als Anzeigetext; das ist keine globale Namenssuche. Auch deren Patientenblatt-Protokolle sind leer. Der Code verwendet künftig den vollständigen Namen und kennzeichnet diese Herkunft ausdrücklich mit `source=phone`.

Über alle 34 protokollierten `matched`-Entscheidungen hinweg ist kein gefülltes Patientenblatt dokumentiert. Das ist ein Befund zu den gespeicherten Zugriffs-/Feldprotokollen, keine pauschale Aussage über jede denkbare Offenlegung in Antworttexten. Für 51 ältere Entscheidungen liegt kein entsprechendes Namens-/Blattprotokoll vor; daraus wird kein positiver Identitätsnachweis abgeleitet. Private Daten, Namen, Nummern und Texte bleiben außerhalb von Git.

## Rechnungsversand und Wissen

Neuer lesender Vertrag `invoice-dispatch-v1` in AnimaDesk: gezielt ein Patient, bestehendes Worker-Geheimnis, ausschließlich `abrechnung_runtime`. Kein Portal-Konto als Voraussetzung, keine PDF-Auslieferung und kein Öffnungsereignis durch den Lesezugriff. Das bestätigte Patientenblatt erhält Quartal, Rechnungs-Mail-Datum, Zustellung, Mail-Öffnung, Rechnungsaufruf/PDF-Abruf und aktiven Portalzugang. Fehlende Öffnung bleibt unbekannt. Historische Belegversionen und Ereignisse nach dem Nachrichteneingang werden nicht als aktueller damaliger Versand ausgegeben.

Wissenseintrag `ablauf-rechnung-mail-ohne-portal`, Titel „Rechnungen per E-Mail“, Version 3, mit Juans Auftrag veröffentlicht und indexiert. Inhalt liegt in `2026-11-25-invoice-email-knowledge.json`. Bei Rechnungs-Mail-Fragen wird dieser freigegebene Eintrag gezielt als Kontext beigefügt. Systemtext und Prüfanweisung bleiben unverändert; deren bestehender Qualitätsnachweis gilt weiterhin, zusätzlich zu den Regressionstests dieser Änderung.

## Wiederholung von I01 ohne Versand

Originaleingang und vorangehende reale Historie eingefroren, bestätigte Chatzuordnung aus AnimaLine übernommen. Neues Ergebnis: Angehörigen-Treffer, richtiges Patientenblatt, `confirmed=true`; Rechnungsversand gefüllt. Q3-Mail: 24.11.2026, 15:37:18 Berlin versandt, 15:37:22 zugestellt; keine Öffnung erfasst, Portalzugang aktiv.

Der Probelauf nutzt die aktuelle Antwortkette und echtes Produktionswissen. Die Rechnungsversand-Antwort wurde mit derselben Server-Lesefunktion lesend aus Production ermittelt und für den lokalen Lauf eingefroren, weil das Worker-Geheimnis lokal nicht verfügbar ist. Dies ist kein HTTP-Ende-zu-Ende-Test des neuen internen Endpunkts. Es wurden keine Entscheidungen, Praxisaufgaben oder Nachrichten erzeugt. Versandzahl: **0**.

Die Antwort bestätigt die Herkunft der Rechnungs-Mail und erklärt Browser-Link ohne App. Die zusätzliche Bitte nach Versand im Chat bleibt beim Team; der Modellprüfer gibt den ersten Entwurf frei. Der unveränderte Wortlaut wird Juan privat im Chat berichtet, nicht mit Patientenname im Repository gespeichert.
