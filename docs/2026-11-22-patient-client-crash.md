# Patientenportal: Browserabsturz am 22.11.2026

Das Patientenfoto zeigt die generische Next.js-Meldung eines clientseitigen Fehlers. URL, Zeitpunkt innerhalb der Anmeldung und Browserprotokoll sind unbekannt. Eine eindeutige Zuordnung dieses individuellen Falls ist deshalb nicht möglich.

Reproduzierter Fehler: Ein gültiger Rechnungs-Upload enthält `beleg.quartal: null`. Die vorhandene Portalansicht rief in Liste und Detailansicht dennoch `.match()` auf. Ein Rechnungs-Deep-Link oder der wiederhergestellte Finanzbereich führt dadurch zu `Cannot read properties of null (reading 'match')` und der generischen Fehlerseite. Der echte Komponenten-Browsertest schlug vor der Korrektur genau damit fehl. SQL-/RPC-Prüfungen erkennen diesen Fehler nicht: Die API-Antwort ist gültig, der Browser verarbeitet sie falsch.

Korrektur: Nullwerte und reine PDF-Uploads werden unterstützt; unbekannte Beträge bleiben unbekannt. Abruffehler werden sichtbar und können erneut geladen werden. Zusätzlich verlor `safePatientTarget` das Ziel `section=rechnungen` beim Login; es wird jetzt erhalten. Der ältere Alias `invoices` öffnet den Rechnungsbereich. Fehler während der Anmeldung setzen die Ladeanzeige zurück und geben eine verständliche Rückmeldung. Die Patientenroute hat eine eigene Fehlerseite mit Neuladen und Rückweg zum Portal; dabei wird nur der gemerkte Tab entfernt, keine Anmeldung gelöscht.

Prüfung: 13 Browserfälle mit echten Komponenten und synthetischer API/Auth, Navigationstests, Abrechnungstests und Produktionsbuild. Keine echten Patientenkonten angelegt, keine Passwörter geändert, keine E-Mails oder WhatsApp-Nachrichten versandt. Die öffentliche Production-Anmeldung, Aktivierungs-/Wiederherstellungsansicht und Weiterleitung wurden ohne Patientenanmeldung auf Browserausnahmen geprüft. Die individuelle Patientensitzung ist damit nicht nachgewiesen.

