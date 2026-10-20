import type {
  AppState,
  CravingRecord,
  Day,
  Growth,
  Moment,
  Ratings,
} from "./storage.ts";

type HistorySource = Pick<AppState, "moments" | "cravings" | "days" | "growth">;
export type HistoryEventKind =
  "checkin" | "after" | "craving" | "day" | "growth";
export type HistoryDayCounts = Record<HistoryEventKind, number>;

type EventBase = {
  id: string;
  recordId: string;
  date: string;
};

export type HistoryTimelineEvent = EventBase &
  (
    | {
        kind: "checkin";
        time: string;
        moment: Moment;
        ratings: Ratings;
      }
    | {
        kind: "after";
        time: string | null;
        moment: Moment;
        ratings: Ratings;
      }
    | { kind: "craving"; time: string; craving: CravingRecord }
    | { kind: "day"; time: null; day: Day; ratings: Ratings }
    | { kind: "growth"; time: null; growth: Growth }
  );

export type HistoryCalendarDay = {
  date: string | null;
  day: number | null;
  inMonth: boolean;
  counts: HistoryDayCounts;
  total: number;
  hasRecords: boolean;
};

export type HistoryCalendarMonth = {
  month: string;
  previousMonth: string | null;
  nextMonth: string | null;
  days: HistoryCalendarDay[];
};

const MIN_YEAR = 1900;
const MAX_YEAR = 2199;
const emptyCounts = (): HistoryDayCounts => ({
  checkin: 0,
  after: 0,
  craving: 0,
  day: 0,
  growth: 0,
});
const pad = (number: number) => String(number).padStart(2, "0");

function parseMonth(month: string): { year: number; month: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError("Ongeldige maand.");
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR || monthNumber < 1 || monthNumber > 12)
    throw new RangeError("De maand moet tussen 1900-01 en 2199-12 liggen.");
  return { year, month: monthNumber };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2)
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Calendar values are kept as recorded, without parsing a local date as UTC. */
export function historyMonthForDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new RangeError("Ongeldige kalenderdatum.");
  const monthValue = date.slice(0, 7);
  const { year, month } = parseMonth(monthValue);
  const day = Number(date.slice(8));
  if (day < 1 || day > daysInMonth(year, month))
    throw new RangeError("Ongeldige kalenderdatum.");
  return monthValue;
}

/** Out-of-range navigation is unavailable, never wrapped or silently clamped. */
export function shiftHistoryMonth(
  month: string,
  offset: number,
): string | null {
  const parsed = parseMonth(month);
  if (!Number.isSafeInteger(offset))
    throw new RangeError("Ongeldige maandstap.");
  const index = parsed.year * 12 + parsed.month - 1 + offset;
  if (index < MIN_YEAR * 12 || index > MAX_YEAR * 12 + 11) return null;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Projection of saved records only. Empty scores and explicit zeros stay distinct. */
function* savedEvents(state: HistorySource): Generator<HistoryTimelineEvent> {
  for (const moment of state.moments) {
    yield {
      id: `checkin:${moment.id}`,
      recordId: moment.id,
      kind: "checkin",
      date: moment.date,
      time: moment.time,
      ratings: moment.before,
      moment,
    };
    // Follow-ups belong to their own saved date and time. Never reuse the
    // check-in date for an unknown follow-up date or infer one from a draft.
    if (moment.after && moment.afterDate)
      yield {
        id: `after:${moment.id}`,
        recordId: moment.id,
        kind: "after",
        date: moment.afterDate,
        time: moment.afterTime || null,
        ratings: moment.after,
        moment,
      };
  }
  for (const craving of state.cravings)
    yield {
      id: `craving:${craving.id}`,
      recordId: craving.id,
      kind: "craving",
      date: craving.date,
      time: craving.time,
      craving,
    };
  for (const day of state.days)
    yield {
      id: `day:${day.date}`,
      recordId: day.date,
      kind: "day",
      date: day.date,
      time: null,
      ratings: day.ratings,
      day,
    };
  for (const growth of state.growth)
    yield {
      id: `growth:${growth.id}`,
      recordId: growth.id,
      kind: "growth",
      date: growth.date,
      time: null,
      growth,
    };
}

/** Timed events first, then date-only notes. Equal times keep source order. */
export function historyDayTimeline(
  state: HistorySource,
  date: string,
): HistoryTimelineEvent[] {
  historyMonthForDate(date);
  const events: HistoryTimelineEvent[] = [];
  for (const event of savedEvents(state))
    if (event.date === date) events.push(event);
  return events.sort((a, b) => {
    if (a.time === b.time) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  });
}

/** Monday-first, complete weeks. A marker means an event exists, not completion. */
export function buildHistoryCalendar(
  state: HistorySource,
  month: string,
): HistoryCalendarMonth {
  const parsed = parseMonth(month);
  const previousMonth = shiftHistoryMonth(month, -1);
  const nextMonth = shiftHistoryMonth(month, 1);
  const length = daysInMonth(parsed.year, parsed.month);
  // Use UTC solely to find a weekday for numeric calendar parts. No saved
  // local date/time is converted to an instant or across a timezone boundary.
  const leading =
    (new Date(Date.UTC(parsed.year, parsed.month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Math.ceil((leading + length) / 7) * 7;
  const days: HistoryCalendarDay[] = Array.from(
    { length: cells },
    (_, index) => {
      const day = index - leading + 1;
      let date: string | null;
      let dayNumber: number | null;
      if (day < 1 && previousMonth) {
        const previous = parseMonth(previousMonth);
        dayNumber = daysInMonth(previous.year, previous.month) + day;
        date = `${previousMonth}-${pad(dayNumber)}`;
      } else if (day > length && nextMonth) {
        dayNumber = day - length;
        date = `${nextMonth}-${pad(dayNumber)}`;
      } else if (day >= 1 && day <= length) {
        dayNumber = day;
        date = `${month}-${pad(day)}`;
      } else {
        date = null;
        dayNumber = null;
      }
      return {
        date,
        day: dayNumber,
        inMonth: day >= 1 && day <= length,
        counts: emptyCounts(),
        total: 0,
        hasRecords: false,
      };
    },
  );
  const byDate = new Map(
    days.filter((day) => day.date).map((day) => [day.date, day]),
  );
  for (const event of savedEvents(state)) {
    const day = byDate.get(event.date);
    if (!day) continue;
    day.counts[event.kind]++;
    day.total++;
    day.hasRecords = true;
  }
  return { month, previousMonth, nextMonth, days };
}
