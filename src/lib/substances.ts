import type { CravingRecord } from "./storage.ts";

export const SUBSTANCE_OPTIONS = [
  "Alcohol",
  "Nicotine",
  "Cannabis",
  "Cocaine",
  "3-MMC",
] as const;

export function cravingSubstances(
  record: Pick<CravingRecord, "substance" | "substances">,
): string[] {
  if (record.substances !== undefined) return [...record.substances];
  return record.substance ? [record.substance] : [];
}

export function withCravingSubstances(
  record: CravingRecord,
  names: readonly string[],
): CravingRecord {
  const next = { ...record };
  delete next.substance;
  delete next.substances;
  if (names.length === 1 && names[0]) next.substance = names[0];
  else if (names.length > 1) next.substances = [...names];
  return next;
}
