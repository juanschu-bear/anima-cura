# Datenvertrag: letzter Status einer Rechnungsmail

Stand: 18.11.2026  
Lesender Endpunkt in Anima Cura: `GET /api/kommunikation?days=365`  
Lesender Endpunkt im Leitstand: `GET /api/abrechnung/notifications/mail-status?days=730`  
Berechtigung beider Praxiswege: `admin` oder `verwaltung`; sonst `401` beziehungsweise `403`.

Die bestehende Antwort enthält zusätzlich `invoiceMailStatuses`. Eine Zeile bezeichnet genau die Kombination aus Patient, Rechnungsdokument und versendeter Mail. Familienmails mit mehreren Rechnungen ergeben deshalb mehrere Zeilen mit derselben `messageId`.

```ts
type InvoiceMailStatusCode =
  | "accepted"
  | "delivered"
  | "delayed"
  | "rejected"
  | "complaint"
  | "opened";

type InvoiceMailStatus = {
  patientId: string;
  firstName: string | null;
  lastName: string | null;
  patientName: string | null;
  patientNumber: string | null;
  documentId: string;
  messageId: string;
  campaignKey: string | null;
  status: InvoiceMailStatusCode;
  statusAt: string;             // ISO 8601, Zeitpunkt des letzten Status
  acceptedAt: string | null;
  deliveredAt: string | null;
  delayedAt: string | null;
  rejectedAt: string | null;
  complaintAt: string | null;
  openedAt: string | null;
  rejectionKind: "bounced" | "failed" | "suppressed" | null;
  rejectionReason: string | null;
};

type InvoiceMailCampaign = {
  campaignKey: string;
  name: string;                 // z. B. „Erinnerung vom 18.11.2026“
  sentAt: string;               // ISO 8601
  mailCount: number;            // eindeutige Nachrichten
  invoiceCount: number;         // eindeutige Rechnungsdokumente
};

type InvoiceMailStatusResponse = {
  asOf: string;
  invoiceMailStatuses: InvoiceMailStatus[];
  campaigns: InvoiceMailCampaign[];
  truncated: boolean;
};
```

## Anzeige

| `status` | Anzeige im Leitstand |
|---|---|
| `accepted` | Angenommen |
| `delivered` | Zugestellt |
| `delayed` | Verzögert |
| `rejected` | Zurückgewiesen |
| `complaint` | Beschwerde |
| `opened` | Geöffnet |

`failed`, `bounced` und `suppressed` werden stabil als `rejected` ausgegeben. Ein dokumentierter Mail-Link-Klick zählt bei der Rechnungsmail als `opened`. `status` ist das zeitlich jüngste gespeicherte Ereignis; die einzelnen `*At`-Felder bleiben als Verlauf erhalten. Ein App- oder PDF-Aufruf verändert diesen Mailstatus nicht.

Bei `status: "rejected"` bezeichnet `rejectionKind` den Anbieterfall. `rejectionReason` enthält ausschließlich die betriebliche Begründung des Anbieters. Bei `bounced` werden `type`, `subType` und `message` in dieser Reihenfolge zusammengeführt. Die Praxisansicht sortiert mit `lastName`, dann `firstName`; `patientName` bleibt nur zur Abwärtskompatibilität erhalten.

## Beispiel

```json
{
  "invoiceMailStatuses": [
    {
      "patientId": "uuid",
      "firstName": "Vorname",
      "lastName": "Nachname",
      "patientName": "Vorname Nachname",
      "patientNumber": "00001234",
      "documentId": "uuid",
      "messageId": "uuid",
      "campaignKey": "q3_2026_invoice_email",
      "status": "delivered",
      "statusAt": "2026-11-12T09:41:00.000Z",
      "acceptedAt": "2026-11-12T09:40:00.000Z",
      "deliveredAt": "2026-11-12T09:41:00.000Z",
      "delayedAt": null,
      "rejectedAt": null,
      "complaintAt": null,
      "openedAt": null,
      "rejectionKind": null,
      "rejectionReason": null
    }
  ],
  "campaigns": [
    {
      "campaignKey": "q3_2026_invoice_email",
      "name": "Rechnungsmail vom 13.11.2026",
      "sentAt": "2026-11-13T08:00:00.000Z",
      "mailCount": 777,
      "invoiceCount": 1953
    }
  ],
  "asOf": "2026-11-18T10:00:00.000Z",
  "truncated": false
}
```

Die Antwort trägt `Cache-Control: private, no-store`. Die vorhandenen Felder `messages`, `summary`, `billingReconciliation` und `billingReviewRows` bleiben unverändert.

Der Leitstand gibt nur die oben beschriebenen Felder weiter. Er liest keine Anima-Cura-Tabellen direkt, verwendet keinen privilegierten Datenbankschlüssel und ruft den geschützten internen Leseweg mit dem bestehenden Worker-Geheimnis ab. Fehlt die Modulkonfiguration, antwortet er kontrolliert mit `409 { code: "billing_not_configured" }`; ist die Quelle vorübergehend nicht erreichbar, mit `503 { code: "invoice_mail_status_unavailable" }`.

Eine Rechnungsmail mit `bounced`, `failed`, `suppressed` oder `complained` erzeugt eine aktive Übergabesperre für die betroffenen Rechnungsdokumente. Zahlungserinnerungen und Mahnungen bleiben gesperrt, bis `confirm_invoice_delivery_handoff` die Übergabe durch die Praxis protokolliert.
