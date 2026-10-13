import type {
  AppState,
  CravingRecord,
  Day,
  Growth,
  Moment,
  Ratings,
} from "./storage.ts";

export type WeekObservation = {
  id: string;
  date: string;
  time: string;
  kind: "checkin" | "after" | "day";
  ratings: Ratings;
  moment?: Moment;
  day?: Day;
};

export type WeekDay = {
  date: string;
  observations: WeekObservation[];
  cravings: CravingRecord[];
  growth: Growth[];
};

export type MeasureCoverage = {
  total: number;
  mood: number;
  pans: number;
};

function calendarDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Local calendar arithmetic: seven dates, including today, also across DST. */
export function weekDates(endDate: string): string[] {
  const [year, month, day] = endDate.split("-").map(Number);
  return Array.from({ length: 7 }, (_, index) =>
    calendarDate(new Date(year, month - 1, day - 6 + index, 12)),
  );
}

export function sleepDescription(day: Day): string {
  if (day.sleepHours === "" && day.sleepMinutes === "") return "niet ingevuld";
  if (day.sleepHours === "")
    return `uren niet ingevuld · ${day.sleepMinutes} minuten (onvolledig)`;
  if (day.sleepMinutes === "")
    return `${day.sleepHours} uur · minuten niet ingevuld (onvolledig)`;
  return `${day.sleepHours} uur en ${day.sleepMinutes} minuten`;
}

/** Read-only projection. Records and observations deliberately remain distinct. */
export function buildWeekOverview(state: AppState, endDate: string) {
  const days: WeekDay[] = weekDates(endDate).map((date) => ({
    date,
    observations: [],
    cravings: [],
    growth: [],
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const moment of state.moments) {
    byDate.get(moment.date)?.observations.push({
      id: `${moment.id}:before`,
      date: moment.date,
      time: moment.time,
      kind: "checkin",
      ratings: moment.before,
      moment,
    });
    // A follow-up belongs to its own recorded date, not its check-in's date.
    if (moment.after && moment.afterDate && moment.afterTime) {
      byDate.get(moment.afterDate)?.observations.push({
        id: `${moment.id}:after`,
        date: moment.afterDate,
        time: moment.afterTime,
        kind: "after",
        ratings: moment.after,
        moment,
      });
    }
  }
  for (const day of state.days) {
    byDate.get(day.date)?.observations.push({
      id: `${day.date}:day`,
      date: day.date,
      time: "",
      kind: "day",
      ratings: day.ratings,
      day,
    });
  }
  for (const craving of state.cravings)
    byDate.get(craving.date)?.cravings.push(craving);
  for (const growth of state.growth)
    byDate.get(growth.date)?.growth.push(growth);

  const coverage: Record<WeekObservation["kind"], MeasureCoverage> = {
    checkin: { total: 0, mood: 0, pans: 0 },
    after: { total: 0, mood: 0, pans: 0 },
    day: { total: 0, mood: 0, pans: 0 },
  };
  for (const day of days) {
    day.observations.sort((a, b) =>
      (a.time || "24:00").localeCompare(b.time || "24:00"),
    );
    day.cravings.sort((a, b) => a.time.localeCompare(b.time));
    for (const observation of day.observations) {
      const count = coverage[observation.kind];
      count.total++;
      if (observation.ratings.mood !== null) count.mood++;
      if (observation.ratings.pans != null) count.pans++;
    }
  }
  return {
    start: days[0].date,
    end: days[6].date,
    days,
    coverage,
    recordedDays: days.filter(
      (day) =>
        day.observations.length + day.cravings.length + day.growth.length > 0,
    ).length,
    cravings: days.reduce((count, day) => count + day.cravings.length, 0),
    growth: days.reduce((count, day) => count + day.growth.length, 0),
  };
}
