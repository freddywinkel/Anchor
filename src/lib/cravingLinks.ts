import type { AppState, CravingRecord, Moment } from "./storage.ts";

// Eligibility is a choice offered by the UI, not a storage invariant: older
// links remain readable after a date edit, craving removal or backup restore.
// Committed records use padded local calendar values; no timezone is inferred.
export function eligibleCheckins(
  state: Pick<AppState, "moments">,
  craving: Pick<CravingRecord, "date" | "time">,
): Moment[] {
  const cravingTime = `${craving.date}T${craving.time}`;
  return state.moments.filter(
    (moment) =>
      moment.cravingId === undefined &&
      `${moment.date}T${moment.time}` >= cravingTime,
  );
}
