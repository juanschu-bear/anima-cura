# Übergabe an Claude: gruppenweise Planbestätigung

Stand 04.11.2026. Backend-Vertrag implementiert; keine Oberfläche in diesem Auftrag geändert. Noch keine Production-Aktivierung oder Praxisabnahme. Neue Quellviews aus `database/abrechnung/011_reconstruction_sources.sql` müssen vor Aktivierung verfügbar sein; diese Datei wird nicht automatisch ausgeführt.

## Vorschläge lesen

`GET /api/abrechnung/plans/reconstructions?patientId=<UUID>&patientId=<UUID>`

Maximal 25 IDs. Bestehende Sitzung und Modulrecht `rechnungen`. Antwort `{items:[{patientId,reconstruction}]}`. Ein unbekannter Patient wird nicht als leerer Vorschlag erfunden. Der Client gleicht zurückgegebene IDs mit angefragten IDs ab.

`reconstruction` enthält je Feld `{value,certainty,evidence}` mit `sicher | wahrscheinlich | offen`. Dazu `category`, `consumedQuarters`, `sourceEvidence`, `ruleReview` und `fingerprint`. `sicher` wird nur aus einem bestätigten Plan mit verknüpftem Planbeleg übernommen. `currentQuarter` ist das Kalenderquartal seit Beginn und ausdrücklich nicht der Verbrauch.

Pflichtfelder für Gruppenbestätigung: category, family, insurance, insurer, jaws, start, validFrom, validTo, plannedQuarters, consumedQuarters, quarterPositions, quotas. Alle müssen mindestens wahrscheinlich sein; offene/nicht ausführbare Praxisregeln oder widersprüchliche Regeln sperren den Gruppenschritt. Fehlende historische Abschläge sind nicht automatisch null. Kein leeres Kontingent als Ersatz für fehlende Mengen verwenden.

Patienten über den vorhandenen Falllisten-Endpunkt vollständig paginieren; nicht auf Status aktiv filtern. Der neue GET liest ausschließlich die angefragten Patienten. Der CLI-Dry-Run verwendet dagegen die gesamte Patiententabelle einschließlich aller Status.

## Nach Sabines bewusster Bestätigung senden

`POST /api/abrechnung/plans/batch-confirm`

```json
{
  "items": [
    {
      "reconstructionFingerprint": "<64 hex>",
      "command": {
        "commandId": "<eigene stabile UUID für diesen Patienten und diesen Versuch>",
        "patientId": "<Patienten-UUID>",
        "expectedRevision": 0,
        "sourceToken": "<aus bestehendem command-context>",
        "operation": {
          "type": "plan.confirm",
          "plan": {"id": "<Plan-UUID>", "revision": 0},
          "evidence": {"kind": "rekonstruktion", "refs": ["reconstruction:<64 hex>", "<weitere geprüfte Belegreferenzen>"]},
          "validFrom": "<YYYY-MM-DD>",
          "validTo": "<YYYY-MM-DD>",
          "start": "<YYYY-MM-DD>",
          "plannedQuarters": 16,
          "insurance": "GKV",
          "insurer": "<belegter Kostenträger>",
          "jaws": "both",
          "history": {"from": null, "complete": false},
          "quotas": [{"code": "<belegte Position>", "jaw": "OK", "quantity": 1}],
          "quarterPositions": [{"code": "119a", "jaw": "OK", "quantity": 1}],
          "reason": "Geprüften Planvorschlag durch Praxis bestätigt"
        }
      }
    }
  ]
}
```

Das Beispiel ist ein Schema, kein ausführbarer Patientenbefehl. Werte müssen exakt dem geprüften Vorschlag entsprechen. Menge bei Quartalspositionen ist immer 1. Verlaufsvollständigkeit nicht aus der bloßen Zahl vorhandener Abschläge ableiten. Vorhandenen `command-context` und Planrevision verwenden; neue Plan-ID nur bei einem neuen Plan.

Maximal 25 Elemente und 512 KiB pro Request. Origin-Prüfung, bestehende Sitzung, Schreibrecht `rechnungen`. Pro Patient eigene Transaktion, erneute Rechteprüfung und genau ein bestehendes `plan.confirm`; keine Gesamttransaktion. Die bestehenden Receipt-, Actor-, Revisions- und Auditregeln bleiben erhalten. Die Historie erhält den Rekonstruktionsfingerprint als Belegreferenz.

HTTP 207: `{items:[{index:0,status:"confirmed",result:{revision,ids,value}},{index:1,status:"failed",code:"reconstruction_stale"}]}`. Ergebnisse anhand des Eingabeindex zuordnen, nicht anhand einer Erfolgszählung. Ein fachlicher oder technischer Fehler stoppt andere Patienten nicht.

Bei Transportabbruch unveränderte Elemente mit unveränderter `commandId` erneut senden. Derselbe Befehl desselben Actors liefert seinen gespeicherten Receipt, auch wenn die Bestätigung inzwischen den Quellstand verändert hat. Geänderte Nutzlast unter derselben ID wird zurückgewiesen. Eine Korrektur nach erneutem Prüfen bekommt eine neue ID.

`reconstruction_stale`: Vorschlag neu laden, erneut prüfen. `reconstruction_incomplete`: offene Felder/Regeln bearbeiten, nicht automatisch füllen. `reconstruction_payload_mismatch`: Nutzlast entspricht nicht dem Vorschlag. `command_id_reused`, `patient_revision_conflict`, `source_revision_conflict`: bestehende Konfliktbehandlung. Andere Fehler: `plan_confirmation_failed`.

Ohne Modulvariablen weiterhin HTTP 409 `billing_not_configured` vor Sitzung, Body und Datenbankzugriff. Dieser Gruppenpfad bestätigt ausschließlich Pläne. Er löst weder Abrechnung noch Finanzübergabe aus.
