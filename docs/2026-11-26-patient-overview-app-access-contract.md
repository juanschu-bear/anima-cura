# Patientenübersicht und App-Zugang – Vertrag für Claude

## Auftrag und Zuständigkeit

Codex stellt die hier beschriebenen Backend-Routen bereit. Claude gestaltet die bestehende Patientenübersicht und bindet sie an. Keine erfundenen Beispieldaten im Produkt. Die Abrechnung und Zahlungen werden nicht geändert. Der gesonderte Zahlungszuordnungsfall aus Juans Screenshot bleibt ausdrücklich zurückgestellt.

## 1. App-Zugang

`GET /api/patient-app-access?patientId=<uuid>` – bestehende AnimaDesk-Sitzung, admin/verwaltung, zusätzlich serverseitiges Patienten-Modulrecht. Liefert:

```json
{"patientId":"uuid","asOf":"ISO","recipients":[{"key":"policyholder","email":"person@example.com","name":"Alex Beispiel","requiresRecipientConfirmation":true}],"account":{"state":"not_linked","meaning":"patient_account_association"},"requests":[{"requestId":"uuid","state":"accepted","requestedAt":"ISO","acceptedAt":"ISO","errorCode":null,"recipientKey":"policyholder","email":"person@example.com","actorId":"uuid"}]}
```

Empfänger-Schlüssel: `patient` = E-Mail im Patientenprofil; `policyholder` = Hauptversicherter; `second_guardian` = zweiter hinterlegter Elternkontakt. Aus `policyholder` darf die Oberfläche nicht automatisch „Mutter“ oder „Sorgeberechtigter“ machen. Die Praxis bestätigt vor dem Versand, dass dieser Kontakt den Zugang für die ausgewählte Person erhalten darf. Keine freie Empfängeradresse im Versanddialog; Korrekturen über die bestehende Profilpflege, danach Daten neu laden.

`POST /api/patient-app-access` mit Same-Origin und bestehender Sitzung:

```json
{"requestId":"neue UUID pro bewusstem Versand","patientId":"uuid","recipientKey":"policyholder","expectedEmail":"person@example.com","recipientConfirmed":true,"language":"de"}
```

`language`: de/en. Antwort: `{requestId,state,requestedAt,acceptedAt,errorCode}`. Keine Zugangstoken im Browser oder in der Antwort. Server prüft Empfänger erneut und sendet ausschließlich an die hinterlegte Adresse. Bei geändertem Empfänger `409 recipient_changed`; Daten neu laden und erneut bestätigen. Fehlende Rechte 401/403, ungültige Eingaben 400, fehlender Patient 404, Quellfehler 503.

Status: `processing`, `accepted`, `failed`, `outcome_unknown`. `accepted` bedeutet **Mailanbieter hat angenommen**, nicht zugestellt, geöffnet oder Konto angelegt. `failed` bedeutet Vorbereitung fehlgeschlagen. Bei `outcome_unknown` ist der Versand unklar: erst GET aktualisieren, niemals automatisch mit neuer UUID nachsenden. Netzwerkfehler beim POST können ebenfalls `503 outcome_unknown` liefern. Dieselbe requestId erneut verwenden, um den vorhandenen Auftrag abzurufen. Bei Doppelklicks gilt derselbe Auftrag; innerhalb eines serverseitigen Fünf-Minuten-Zeitfensters werden zusätzliche Aufträge an denselben Patienten/Empfänger zusammengeführt. Zeitfenster sind keine exakt rollierende Sperrfrist.

Der Einladungslink gilt 14 Tage, enthält keine Patientendaten und gilt nur für den ausgewählten Patienten. Andere Kinder derselben E-Mail werden nicht durch diese Einladung neu freigegeben. Bestehende, zuvor berechtigte Kontozuordnungen werden nicht entfernt. Registrierung oder Verbindung eines vorhandenen Kontos setzt weiterhin die vorhandene Anmeldung/Geburtsdatumsprüfung voraus. Eine Rechnung wird nicht vorausgesetzt. Ziel nach Aktivierung: `/patient/portal` statt Rechnungsbereich. Die Mail enthält eine Anleitung zum Hinzufügen auf den Home-Bildschirm.

Abgelaufene **Praxis-Einladungen** werden erneut durch die Praxis ausgestellt: der öffentliche alte Rechnungs-Resend liefert dafür `409 practice_invitation_required`. Er darf nicht auf eine breitere E-Mail-/Familienfreigabe zurückfallen. In der Patienten-Zugangsoberfläche diesen Fall als „Bitte schreiben Sie der Praxis für einen neuen Zugang“ darstellen, nicht als bereits versendete Mail. Die vorhandene Rechnungs-Resend-Strecke bleibt für alte Rechnungslinks bestehen.

### Gestaltung

Button **App-Zugang senden**, Empfängerdialog mit Beziehung und Bestätigung, während POST deaktivieren, Ergebnis mit Uhrzeit. Fehlende Adresse führt zur Profilpflege. `requests` ist ein Versandverlauf, keine automatische Erinnerungskette. Kein automatischer Versand beim Suchen oder Öffnen eines Patienten.

`account.state=linked`: Benutzerkonto ist dem Patienten zugeordnet. `not_linked`: **Kein zugeordnetes Benutzerkonto gefunden**, nicht „diese Familie hat kein Konto“.

Die bisherigen Zählwerk-Felder zur App-Nutzung bleiben bestehen. Kein erfasstes Öffnen beweist nicht, dass die App fehlt. Formulierung **„Noch keine App-Nutzung erfasst“**. Installation, Nutzung, Anmeldung, Mailöffnung und Rechnungsöffnung getrennt anzeigen. Bei nicht verfügbarer Messquelle „Nutzung derzeit nicht prüfbar“. Keine roten Fehleranzeigen für bloß fehlende Nutzung.

## 2. Fachliche Übersicht

`GET /api/abrechnung/patient-overview?patientId=<uuid>` – Abrechnungs-Modulrecht und vorhandene Sitzung; ausgeschaltetes Modul liefert wie alle Abrechnungsrouten `409 billing_not_configured` vor weiteren Zugriffen. Nur beim ausgewählten Patienten laden, nicht für jeden Suchtreffer parallel.

Antwort: `patientId`, `name` („Nachname, Vorname“), `asOf`, `family`, `category`, `insurance`, `insurer`, `start`, `plannedQuarters`, `documentedMeasures`, `billingForms`, `patientInvoice`, `patientShare`, `payerHistory`, `planCompleteness`, `fingerprint`.

Die sechs Einzelfelder haben `{value,state,evidence:[{kind,ref,text}]}`. `state`: `documented`, `inferred`, `unknown`. Die vorhandenen Rekonstruktionswerte und Regel-/Quellbelege werden übernommen. Behandlungsfamilie und konkrete Kategorie getrennt darstellen. Ein unvollständiger Gesamtplan setzt bekannte Einzelfelder nicht auf unbekannt zurück. `planCompleteness.state` behält die bestehenden Werte `sicher`, `wahrscheinlich`, `offen`; dies ist nicht der Zustand jedes einzelnen Feldes.

`documentedMeasures`: zusätzliche Belege etwa `{value:"space_maintainer_documented",state:"inferred",evidence:[{kind:"scribe",ref:"uuid",at:"Datum"}]}` aus bestätigter Dokumentation. Anzeige **„Lückenhalter dokumentiert“** mit Datum; kein Beweis, dass die Maßnahme heute aktiv ist oder vollständig von der Versicherung bezahlt wird. Negierte/geplante Aussagen werden nicht als Durchführung übernommen.

`billingForms` kann mehrere Einträge enthalten: `{value,state,sourceIds}` mit `quarterly_invoices_observed`, `single_payment_agreed`, `installments_agreed`. Dies bedeutet beobachtete Quartalsrechnungen bzw. dokumentierte Zahlungsvereinbarung. **Einmalzahlung ist keine automatische Einordnung als Einzelbehandlung.** Eine einzelne Rechnung oder ein einzelner Geldeingang genügt dafür nicht.

`patientInvoice`: `{state,documents,required,reason}`. `state`: `documents_found`, `no_document_found`, `source_unavailable`; `required` bleibt ohne ausdrücklichen fachlichen Beleg null. Deshalb aus `no_document_found` niemals „Keine Rechnung erforderlich“ machen.

`patientShare`: `{state:"documented_per_invoice"|"unknown",invoices:[{documentId,cents}]}`. Dokumentierte Rechnungsanteile, **kein offener Saldo und keine Zahlungsaussage**; nicht mit historischen Zusammenfassungen zu einer Gesamtschuld addieren.

`payerHistory` liefert die vorhandenen zeitbezogenen Kostenträgerbelege aus Rechnungen. Ein Versicherungsname oder GKV-Status belegt keine vollständige Kostenübernahme. Allgemeine Wissensbasisregeln helfen bei der Einordnung, ersetzen aber keine individuelle Leistungs-/Kostenträgerzusage.

Noch nicht belegt ist eine automatisch bestätigte Einzelmaßnahme für den zuvor besprochenen Lückenhalter-Fall: Die mündliche Praxisangabe wurde nicht stillschweigend als bestätigter Datenbankfakt gespeichert. Keine patientenspezifischen Sonderfälle im Frontend hardcoden.

## Grenzen und Abnahme

Keine UI-Dateien in diesem Backend-Auftrag geändert. Claude übernimmt auch den verständlichen App-Start ohne vorhandene Rechnungen; ein leeres Behandlungskonto darf dort nicht automatisch als fehlerhafte Registrierung gelten. Der aktuelle Patienten-Zugangsbildschirm ist noch rechnungsbezogen beschriftet und muss für allgemeine Einladungen sprachlich angepasst werden.

Tests: unberechtigte Sitzung, Same-Origin, gespeicherte/zwischenzeitlich geänderte Empfänger, explizite Empfängerbestätigung, Doppelklick, unklarer Versand, Registrierung ohne Rechnung, beschränkte Patientenzuordnung trotz vorhandener Familienkontakte, Installation/Nutzung unbekannt, bekannte Kategorie bei unvollständigem Plan, Einzelzahlung plus Quartalsrechnungen und fehlende Rechnungsquelle.

Migration: Cura `108_practice_app_access.sql`, SHA-256 `ac5c2b0dfa6747303b7e82808982a54bac3e11b8bd4f4437555e9b448315bc0e`. Private Versandbelege und optionaler patientenbezogener Geltungsbereich bestehender Zugangslinks; keine neuen öffentlichen Tabellenrechte und keine Änderungen an Finanzdaten. Lokal mit PostgreSQL-Engine getestet, auf Cura eingespielt. Kein Testversand an Patienten.
