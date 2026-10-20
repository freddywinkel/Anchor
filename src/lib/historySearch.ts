import {
  historyDayTimeline,
  historyMonthForDate,
  type HistoryTimelineEvent,
} from "./historyCalendar.ts";
import { cravingSubstances } from "./substances.ts";
import type {
  AppState,
  CravingRecord,
  Day,
  Growth,
  Moment,
  Ratings,
} from "./storage.ts";

type HistorySource = Pick<AppState, "moments" | "cravings" | "days" | "growth">;
export type HistorySearchKind =
  "all" | "checkin" | "craving" | "day" | "growth";
export type HistorySearchCriteria = {
  period: "all" | "week";
  kind: HistorySearchKind;
  query: string;
  currentDate: string;
};
export type HistorySearchEntry =
  | { type: "moment"; item: Moment; date: string; time: string }
  | { type: "craving"; item: CravingRecord; date: string; time: string }
  | { type: "day"; item: Day; date: string; time: string }
  | { type: "growth"; item: Growth; date: string; time: "" };
export type HistoryMoodObservation = {
  id: string;
  date: string;
  time: string;
  mood: number;
  label: string;
};

function ratingsText(ratings: Ratings | null): string {
  return `${ratings?.emotionRatings?.map((emotion) => emotion.label).join(" ") || ""} ${ratings?.pans != null ? `pannetjes ${ratings.pans}/5` : ""}`;
}

/** Shared record-level query context for the list, scores and selected-day view. */
function searchContext(
  state: HistorySource,
  { kind, query }: Pick<HistorySearchCriteria, "kind" | "query">,
) {
  const text = query.trim().toLocaleLowerCase("nl-NL");
  const cravings = new Map(
    state.cravings.map((craving) => [craving.id, craving]),
  );
  const momentMatches = new Map<Moment, boolean>();
  const includes = (value: string) =>
    value.toLocaleLowerCase("nl-NL").includes(text);
  const allows = (candidate: Exclude<HistorySearchKind, "all">) =>
    kind === "all" || kind === candidate;
  return {
    moment(item: Moment) {
      if (!allows("checkin")) return false;
      const cached = momentMatches.get(item);
      if (cached !== undefined) return cached;
      // A name is searchable only through the user's explicit, existing link.
      // Neither matching dates nor goals supply a missing craving or substance.
      const linked = item.cravingId ? cravings.get(item.cravingId) : undefined;
      const result = includes(
        `${item.note} ${item.activity} ${item.emotions.join(" ")} ${ratingsText(item.before)} ${ratingsText(item.after)} check-in ${item.cravingId ? "gekoppelde craving terugblik" : ""} ${linked ? cravingSubstances(linked).join(" ") : ""}`,
      );
      momentMatches.set(item, result);
      return result;
    },
    craving(item: CravingRecord) {
      return (
        allows("craving") &&
        includes(
          `${cravingSubstances(item).join(" ")} ${item.situation} ${item.thought} ${item.bodySensation} ${item.emotion} ${item.behavior} craving drang ${item.usedAfterCraving === true ? "gebruik na craving gebruikt" : ""}`,
        )
      );
    },
    day(item: Day) {
      return (
        allows("day") &&
        includes(
          `${item.note} ${ratingsText(item.ratings)} mijn hele dag dagsamenvatting dagoverzicht dagoverzichten`,
        )
      );
    },
    growth(item: Growth) {
      return (
        allows("growth") &&
        includes(`${item.text} klein moment kleine momenten`)
      );
    },
  };
}

/** Seven calendar dates including currentDate; no local-time or DST conversion. */
function periodStart(currentDate: string): string {
  historyMonthForDate(currentDate);
  const [year, month, day] = currentDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 6))
    .toISOString()
    .slice(0, 10);
}

/** One source card per check-in, with each scored observation kept on its own date. */
export function queryHistory(
  state: HistorySource,
  criteria: HistorySearchCriteria,
): {
  entries: HistorySearchEntry[];
  observations: HistoryMoodObservation[];
  followupCount: number;
} {
  const start = periodStart(criteria.currentDate);
  const withinPeriod = (date: string) =>
    criteria.period === "all" ||
    (date >= start && date <= criteria.currentDate);
  const matches = searchContext(state, criteria);
  const entries: HistorySearchEntry[] = [];
  const observations: HistoryMoodObservation[] = [];
  let followupCount = 0;

  for (const item of state.moments) {
    if (!matches.moment(item)) continue;
    const beforeInPeriod = withinPeriod(item.date);
    const afterInPeriod = Boolean(
      item.after && item.afterDate && withinPeriod(item.afterDate),
    );
    if (!beforeInPeriod && !afterInPeriod) continue;
    entries.push({ type: "moment", item, date: item.date, time: item.time });
    if (beforeInPeriod && item.before.mood !== null)
      observations.push({
        id: `${item.id}-before`,
        date: item.date,
        time: item.time,
        mood: item.before.mood,
        label: "Check-in",
      });
    if (afterInPeriod) {
      followupCount++;
      // A missing historical date or time cannot be replaced by the check-in's.
      // Such a source card stays readable, but has no invented chart timestamp.
      if (
        item.after &&
        item.afterDate &&
        item.afterTime &&
        item.after.mood !== null
      )
        observations.push({
          id: `${item.id}-after`,
          date: item.afterDate,
          time: item.afterTime,
          mood: item.after.mood,
          label: "Nameting",
        });
    }
  }
  for (const item of state.days)
    if (withinPeriod(item.date) && matches.day(item))
      entries.push({ type: "day", item, date: item.date, time: "" });
  for (const item of state.cravings)
    if (withinPeriod(item.date) && matches.craving(item))
      entries.push({ type: "craving", item, date: item.date, time: item.time });
  for (const item of state.growth)
    if (withinPeriod(item.date) && matches.growth(item))
      entries.push({ type: "growth", item, date: item.date, time: "" });

  entries.sort((a, b) =>
    `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
  );
  observations.sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  );
  return { entries, observations, followupCount };
}

/** Retains the calendar helper's ordering and individual event identities. */
export function filterHistoryTimeline(
  state: HistorySource,
  date: string,
  criteria: Pick<HistorySearchCriteria, "kind" | "query">,
): HistoryTimelineEvent[] {
  const matches = searchContext(state, criteria);
  return historyDayTimeline(state, date).filter((event) => {
    switch (event.kind) {
      case "checkin":
      case "after":
        return matches.moment(event.moment);
      case "craving":
        return matches.craving(event.craving);
      case "day":
        return matches.day(event.day);
      case "growth":
        return matches.growth(event.growth);
    }
  });
}
