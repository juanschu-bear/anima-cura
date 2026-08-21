type Answers = Record<string, unknown> | null | undefined;

type SubmissionLike = {
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  created_at: string;
  signiert_am?: string | null;
  answers: Answers;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function pushLine(lines: string[], label: string, value: string | null) {
  if (value) {
    lines.push(`${label}: ${value}`);
  }
}

function pushYesLine(lines: string[], label: string, value: unknown) {
  if (asString(value)?.toLowerCase() === "ja") {
    lines.push(label);
  }
}

function formatInsuranceKind(value: string | null) {
  if (!value) return null;
  return value;
}

export function buildAnamnesisSummaryText(submission: SubmissionLike): string {
  const answers = submission.answers ?? {};
  const lines: string[] = [];
  const patientName = [submission.vorname, submission.nachname].filter(Boolean).join(" ").trim();
  const birthDate = asString(answers["patient_geburtsdatum"]) ?? submission.geburtsdatum;
  const summaryDate = formatIsoDate(submission.signiert_am ?? submission.created_at);

  lines.push("Digitaler Anamnesebogen eingegangen");
  pushLine(lines, "Datum", summaryDate);
  pushLine(lines, "Patient", patientName || null);
  pushLine(lines, "Geburtsdatum", birthDate);
  pushLine(lines, "Besuchsgrund", asString(answers["besuchsgrund"]));

  const insuranceBits = [
    formatInsuranceKind(asString(answers["versicherungsart"])),
    asString(answers["krankenkasse"]),
    asBool(answers["zusatzversicherung"]) === true
      ? `Zusatzversicherung${asString(answers["zusatzversicherung_welche"]) ? ` (${asString(answers["zusatzversicherung_welche"])})` : ""}`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (insuranceBits.length > 0) {
    lines.push(`Versicherung: ${insuranceBits.join(" · ")}`);
  }

  const insuredName = [
    asString(answers["vp_anrede"]),
    asString(answers["vp_vorname"]),
    asString(answers["vp_nachname"]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (insuredName) {
    lines.push(`Versicherte Person: ${insuredName}`);
  }

  const contactBits = [
    asString(answers["vp_telefon"]) ?? asString(answers["patient_telefon"]),
    asString(answers["vp_email"]) ?? asString(answers["patient_email"]),
  ].filter((value): value is string => Boolean(value));

  if (contactBits.length > 0) {
    lines.push(`Kontakt: ${contactBits.join(" · ")}`);
  }

  const findings: string[] = [];
  pushYesLine(findings, "Aktuelle aerztliche Behandlung", answers["g_behandlung_aktuell"]);
  pushYesLine(findings, "Allgemeine Erkrankungen", answers["g_erkrankungen"]);
  pushYesLine(findings, "Regelmaessige Medikamente", answers["g_medikamente"]);
  pushYesLine(findings, "Allergien / Unvertraeglichkeiten", answers["g_allergien"]);
  pushYesLine(findings, "Physiotherapie / osteopathische Behandlung", answers["g_physio"]);
  pushYesLine(findings, "HNO-Behandlung", answers["g_hno"]);
  pushYesLine(findings, "Unfall im Kiefer-/Zahnbereich", answers["g_unfaelle"]);
  pushYesLine(findings, "Lutschgewohnheit", answers["g_lutschen"]);
  pushYesLine(findings, "Fruehere kieferorthopaedische Behandlung", answers["g_kfo_frueher"]);
  pushYesLine(findings, "Operation im Mund-/Kieferbereich", answers["g_op_mund"]);
  pushYesLine(findings, "Kiefergelenkbeschwerden", answers["g_kiefergelenk"]);
  pushYesLine(findings, "Kopf-/Nackenschmerzen", answers["g_kopfschmerzen"]);
  pushYesLine(findings, "Naechtliches Zaehneknirschen", answers["g_knirschen"]);
  pushYesLine(findings, "Logopaedische Behandlung", answers["g_logopaedie"]);
  pushYesLine(findings, "Geschwister in kieferorthopaedischer Behandlung", answers["g_geschwister_kfo"]);

  const breathing = asString(answers["g_atmung"]);
  if (breathing) {
    findings.push(`Atmung: ${breathing}`);
  }

  const brushing = asString(answers["g_zaehneputzen"]);
  if (brushing) {
    findings.push(`Zaehneputzen: ${brushing}`);
  }

  if (findings.length > 0) {
    lines.push(`Hinweise: ${findings.join(" · ")}`);
  }

  return lines.join("\n");
}
