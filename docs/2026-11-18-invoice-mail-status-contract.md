# Datenvertrag: letzter Status einer Rechnungsmail

Stand: 18.11.2026  
Lesender Endpunkt: `GET /api/kommunikation?days=365`  
Berechtigung: `admin` oder `verwaltung`; sonst `401` beziehungsweise `403`.

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

## Beispiel

```json
{
  "invoiceMailStatuses": [
    {
      "patientId": "uuid",
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
      "openedAt": null
    }
  ]
}
```

Die Antwort trägt `Cache-Control: private, no-store`. Die vorhandenen Felder `messages`, `summary`, `billingReconciliation` und `billingReviewRows` bleiben unverändert.
