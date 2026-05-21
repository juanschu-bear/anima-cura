"use client";

import { t } from "@/lib/i18n";

const PROMPTS_BY_PAGE: Record<string, string[]> = {
  "/uebersicht": [
    "icura.quick.criticalPatients",
    "icura.quick.paymentRate",
    "icura.quick.newAutomation",
  ],
  "/patienten": [
    "icura.quick.searchPatient",
    "icura.quick.childrenCount",
    "icura.quick.noEmail",
  ],
  "/automatisierungen": [
    "icura.quick.createReminder",
    "icura.quick.escalationPipeline",
    "icura.quick.chargebackAlert",
  ],
  "/zahlungen": [
    "icura.quick.connectBank",
    "icura.quick.whatAreChargebacks",
    "icura.quick.openAssignments",
  ],
  "/ratenplan": [
    "icura.quick.createRatePlan",
    "icura.quick.overdueInstallments",
    "icura.quick.exportInstallments",
  ],
  "/mahnwesen": [
    "icura.quick.escalationOverview",
    "icura.quick.openVolume",
    "icura.quick.draggingStages",
  ],
  "/quartal": [
    "icura.quick.lastQuarter",
    "icura.quick.kpiExplain",
    "icura.quick.exportReport",
  ],
  "/einstellungen": [
    "icura.quick.addUser",
    "icura.quick.emailProvider",
    "icura.quick.bankConfig",
  ],
  "/import": [
    "icura.quick.ivorisExport",
    "icura.quick.csvFormats",
    "icura.quick.uploadCsv",
  ],
};

export function ICuraQuickActions({
  currentPage,
  locale,
  onPick,
  disabled,
}: {
  currentPage: string;
  locale: "de" | "en";
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  const page = Object.keys(PROMPTS_BY_PAGE).find((p) => currentPage.startsWith(p)) || "/uebersicht";
  const keys = PROMPTS_BY_PAGE[page];
  if (!keys?.length) return null;

  return (
    <div className="icura-quicks">
      {keys.map((k) => {
        const label = t(k, locale);
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onPick(label)}
            className="icura-quick"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
