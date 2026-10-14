import type { CravingRecord } from "./storage.ts";

export type CravingUseConfirmationText = {
  confirmedAt: string | null;
  confirmedAtLabel: string;
  elapsedLabel: string | null;
};

function elapsedText(minutes: number): string {
  if (minutes < 1) return "Minder dan een minuut";
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  const parts = [
    days ? `${days} ${days === 1 ? "dag" : "dagen"}` : "",
    hours ? `${hours} uur` : "",
    remainingMinutes
      ? `${remainingMinutes} ${remainingMinutes === 1 ? "minuut" : "minuten"}`
      : "",
  ].filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}`;
}

// This describes the explicit confirmation, never when or what was used.
// Craving records have local calendar dates/times without a saved time zone.
export function cravingUseConfirmation(
  record: CravingRecord,
): CravingUseConfirmationText | null {
  if (record.usedAfterCraving !== true) return null;
  const confirmed = record.usedConfirmedAt
    ? new Date(record.usedConfirmedAt)
    : null;
  if (!confirmed || !Number.isFinite(confirmed.getTime())) {
    return {
      confirmedAt: null,
      confirmedAtLabel: "Bevestigingstijd niet bekend.",
      elapsedLabel: null,
    };
  }
  const date = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(confirmed);
  const time = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(confirmed);
  let craving: Date | null = null;
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    /^\d{2}:\d{2}$/.test(record.time)
  ) {
    const candidate = new Date(`${record.date}T${record.time}:00`);
    const [year, month, day] = record.date.split("-").map(Number);
    const [hour, minute] = record.time.split(":").map(Number);
    // Reject normalization of missing/invalid dates and non-existent local times.
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day &&
      candidate.getHours() === hour &&
      candidate.getMinutes() === minute
    )
      craving = candidate;
  }
  const elapsed = craving
    ? confirmed.getTime() - craving.getTime()
    : Number.NaN;
  return {
    confirmedAt: record.usedConfirmedAt!,
    confirmedAtLabel: `Bevestigd op ${date} om ${time}`,
    elapsedLabel: !Number.isFinite(elapsed)
      ? null
      : elapsed < 0
        ? "Vóór het genoteerde cravingmoment bevestigd."
        : `${elapsedText(Math.floor(elapsed / 60_000))} na de craving bevestigd.`,
  };
}
