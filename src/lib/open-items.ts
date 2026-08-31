type OpenItemLike = {
  status?: string | null;
  betrag?: number | null;
  offen?: number | null;
  gezahlt?: number | null;
};

export function resolveOpenItemAmount(item: OpenItemLike) {
  if (typeof item.offen === "number" && Number.isFinite(item.offen)) {
    return Math.max(0, Number(item.offen));
  }
  const betrag = Number(item.betrag ?? 0);
  const gezahlt = Number(item.gezahlt ?? 0);
  return Math.max(0, betrag - gezahlt);
}

export function resolvePaidItemAmount(item: OpenItemLike) {
  if (typeof item.gezahlt === "number" && Number.isFinite(item.gezahlt)) {
    return Math.max(0, Number(item.gezahlt));
  }
  const betrag = Number(item.betrag ?? 0);
  const offen = resolveOpenItemAmount(item);
  return Math.max(0, betrag - offen);
}

export function resolveOpenItemStatus<T extends OpenItemLike>(item: T) {
  const rawStatus = String(item.status || "").toLowerCase();
  if (rawStatus === "erloesminderung") return "erloesminderung";

  const offen = resolveOpenItemAmount(item);
  const gezahlt = resolvePaidItemAmount(item);

  if (offen <= 0.009) return "bezahlt";
  if (gezahlt > 0.009) return "teilbezahlt";
  if (rawStatus === "überfällig" || rawStatus === "ueberfaellig") return "überfällig";
  return "offen";
}
