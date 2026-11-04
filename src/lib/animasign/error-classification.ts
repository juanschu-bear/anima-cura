export type AnimaSignErrorKind =
  | "duplicate_closed"
  | "rejected"
  | "signing_service"
  | "pdf_service"
  | "config";

export type AnimaSignErrorClassification = {
  error_kind: AnimaSignErrorKind;
  error_reason: string;
};

export function classifyAnimaSignError(
  status: string | null | undefined,
  rawReason: string | null | undefined,
): AnimaSignErrorClassification | null {
  if (status !== "fehler") return null;

  const reason = rawReason?.trim() ?? "";

  if (/duplikat|dublette|referenzfall/i.test(reason)) {
    return {
      error_kind: "duplicate_closed",
      error_reason:
        "Diese Einreichung wurde als Dublette geschlossen. Die gültige Einreichung bleibt erhalten.",
    };
  }

  if (/abgelehnt|abgebrochen|rejected/i.test(reason)) {
    return {
      error_kind: "rejected",
      error_reason:
        "Die Unterschrift wurde abgelehnt oder abgebrochen. Bitte den Vorgang mit der betroffenen Person klären.",
    };
  }

  if (
    /ANIMASIGN_PDF_URL|ANIMASIGN_PDF_KEY|PDF_SIGNING_CERT|PDF_SIGNING_PASSPHRASE|ANIMASIGN_API_KEY|DOCUMENSO_API_KEY|DOCUMENSO_KEY|DOCUMENSO_BASE_URL|nicht konfiguriert|Konfiguration/i.test(
      reason,
    )
  ) {
    return {
      error_kind: "config",
      error_reason:
        "AnimaSign ist technisch noch nicht vollständig eingerichtet. Bitte die technische Betreuung informieren.",
    };
  }

  if (/^PDF:|PDF-Dienst|PDF-Erzeugung/i.test(reason)) {
    return {
      error_kind: "pdf_service",
      error_reason:
        "Das PDF konnte nicht erstellt werden. Bitte den Vorgang später erneut prüfen.",
    };
  }

  if (/Documenso|envelope\/(?:create|distribute)|Signaturdienst/i.test(reason)) {
    return {
      error_kind: "signing_service",
      error_reason:
        "Der Signaturdienst konnte die Einreichung nicht verarbeiten. Bitte den Vorgang später erneut prüfen.",
    };
  }

  // All current writers of status="fehler" belong to one of the categories
  // above. Keep an unrecognised historic technical error actionable without
  // exposing its raw database text to the dashboard.
  return {
    error_kind: "config",
    error_reason:
      "Die Einreichung konnte technisch nicht abgeschlossen werden. Bitte die technische Betreuung informieren.",
  };
}
