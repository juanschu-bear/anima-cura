import styles from "./ReceiptPrintDocument.module.css";
import {
  PRAXIS_STAMMDATEN,
  canRenderPatientReceipt,
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptQuarter,
  getReceiptAmountLabel,
  getReceiptAmountNote,
  getReceiptBookingLabel,
  getReceiptDocumentTitle,
  getReceiptIntro,
  getReceiptPatientName,
  getReceiptPatientNumber,
  getReceiptPaymentLabel,
  type KassenBelegData,
  type ReceiptFormat,
  type ReceiptVariant,
} from "@/lib/kasse-receipt";

export default function ReceiptPrintDocument({
  beleg,
  variant,
  format,
}: {
  beleg: KassenBelegData;
  variant: ReceiptVariant;
  format: ReceiptFormat;
}) {
  const activeVariant: ReceiptVariant = canRenderPatientReceipt(beleg) ? variant : "praxis";
  const patientCopy = activeVariant === "patient";
  const paymentLabel = getReceiptPaymentLabel(beleg.zahlart);
  const patientName = getReceiptPatientName(beleg);
  const patientNumber = getReceiptPatientNumber(beleg);
  const bookingDate = formatReceiptDate(beleg.kassen_datum || beleg.created_at);
  const title = getReceiptDocumentTitle(beleg, activeVariant);
  const leftColumn = [
    { key: "Patient", value: patientName },
    { key: "Patientennr.", value: patientNumber, mono: true },
    { key: "Leistung", value: beleg.zweck?.trim() || "Praxisleistung" },
  ];
  const rightColumn = [
    { key: "Buchungsdatum", value: bookingDate },
    { key: "Quartal", value: formatReceiptQuarter(beleg) },
    { key: "Erfasst von", value: PRAXIS_STAMMDATEN.erfasstVon },
  ];

  return (
    <main
      className={styles.sheet}
      data-format={format}
      data-variant={activeVariant}
      data-receipt-ready="true"
    >
      <header className={styles.head}>
        <div className={styles.practiceBlock}>
          <strong className={styles.practiceName}>{PRAXIS_STAMMDATEN.name}</strong>
          <span className={styles.practiceLine}>{PRAXIS_STAMMDATEN.fach}</span>
          <span className={styles.practiceLine}>{PRAXIS_STAMMDATEN.strasse}</span>
          <span className={styles.practiceLine}>{PRAXIS_STAMMDATEN.ort}</span>
        </div>

        <div className={styles.meta}>
          <div className={styles.brand}>
            <svg viewBox="0 0 28 12" aria-hidden="true" className={styles.brandIcon}>
              <line x1="1" y1="6" x2="27" y2="6" stroke="#10222A" strokeOpacity="0.35" />
              <circle cx="19" cy="6" r="3" fill="#1B6F68" />
            </svg>
            AnimaPay Kasse
          </div>
          <dl className={styles.metaGrid}>
            <dt className={styles.metaKey}>Beleg-Nr.</dt>
            <dd className={`${styles.metaValue} ${styles.mono}`}>{beleg.beleg_nr || "—"}</dd>
            <dt className={styles.metaKey}>Datum</dt>
            <dd className={styles.metaValue}>{bookingDate}</dd>
            <dt className={styles.metaKey}>Zahlart</dt>
            <dd className={styles.metaValue}>{paymentLabel}</dd>
          </dl>
        </div>
      </header>

      <section className={styles.titleSection}>
        <span className={styles.variant}>{patientCopy ? "Patientenkopie" : "Praxisexemplar"}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{getReceiptIntro(beleg, activeVariant)}</p>
      </section>

      <section className={styles.amount}>
        <div>
          <div className={styles.amountLabel}>{getReceiptAmountLabel(beleg)}</div>
          <div className={`${styles.amountValue} ${styles.mono}`}>
            {formatReceiptAmount(beleg.betrag, beleg.buchungstyp)}
          </div>
          <div className={styles.amountNote}>{getReceiptAmountNote(beleg)}</div>
        </div>

        <div className={styles.amountMeta}>
          <span className={styles.chip}>{paymentLabel}</span>
          <strong>Buchungsart: {getReceiptBookingLabel(beleg)}</strong>
        </div>
      </section>

      <section className={styles.details}>
        <div className={styles.detailColumn}>
          {leftColumn.map((row) => (
            <div key={row.key} className={styles.row}>
              <span className={styles.key}>{row.key}</span>
              <span className={`${styles.value} ${row.mono ? styles.mono : ""}`}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.detailColumn}>
          {rightColumn.map((row) => (
            <div key={row.key} className={styles.row}>
              <span className={styles.key}>{row.key}</span>
              <span className={styles.value}>{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {!patientCopy && beleg.notiz?.trim() ? (
        <section className={styles.note}>
          <div className={styles.noteTitle}>Interne Notiz</div>
          <div className={styles.noteCopy}>{beleg.notiz.trim()}</div>
        </section>
      ) : null}

      {patientCopy ? (
        <section className={styles.sign}>
          <div className={styles.signLine}>Unterschrift, Stempel der Praxis</div>
          <div className={styles.signLine}>Ort, Datum</div>
        </section>
      ) : null}

      <footer className={styles.foot}>
        <span>
          {PRAXIS_STAMMDATEN.name} · {PRAXIS_STAMMDATEN.strasse} · {PRAXIS_STAMMDATEN.ort}
        </span>
        <span>
          Beleg {beleg.beleg_nr || "—"} · Seite 1 von 1
        </span>
      </footer>
    </main>
  );
}
