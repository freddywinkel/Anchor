import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyState, type Moment, type Day } from "../src/lib/storage.ts";
import {
  buildWeekOverview,
  sleepDescription,
  weekDates,
} from "../src/lib/weekOverview.ts";

function moment(id: string, values: Partial<Moment> = {}): Moment {
  return {
    id,
    date: "2026-10-13",
    time: "12:00",
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Een synthetische notitie",
    ...values,
  };
}

function day(values: Partial<Day> = {}): Day {
  return {
    date: "2026-10-13",
    ratings: { mood: null, eis: null },
    sleepHours: "",
    sleepMinutes: "",
    note: "",
    ...values,
  };
}

describe("eerlijk weekoverzicht", () => {
  it("gebruikt zeven lokale kalenderdagen over jaar-, schrikkel- en zomertijdgrenzen", () => {
    assert.deepEqual(weekDates("2027-01-03"), [
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    assert.deepEqual(weekDates("2024-03-03"), [
      "2024-02-26",
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
      "2024-03-03",
    ]);
    assert.deepEqual(weekDates("2026-10-27"), [
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("laat lege dagen zichtbaar zonder nulmetingen te verzinnen", () => {
    const week = buildWeekOverview(createEmptyState(), "2026-10-13");
    assert.equal(week.start, "2026-10-07");
    assert.equal(week.end, "2026-10-13");
    assert.equal(week.days.length, 7);
    assert.equal(week.recordedDays, 0);
    assert.equal(week.coverage.checkin.total, 0);
    assert.ok(
      week.days.every(
        (value) =>
          !value.observations.length &&
          !value.cravings.length &&
          !value.growth.length,
      ),
    );
  });

  it("behoudt meerdere metingen per dag en onderscheidt nul, ontbrekend, nameting en dagoverzicht", () => {
    const state = createEmptyState();
    state.moments = [
      moment("late", {
        time: "16:00",
        before: { mood: 2, eis: null, pans: 4 },
      }),
      moment("neutral", {
        time: "09:00",
        before: { mood: 0, eis: 0 },
        after: { mood: null, eis: null, pans: 5 },
        afterDate: "2026-10-13",
        afterTime: "10:00",
      }),
      moment("words-only", { time: "11:00" }),
    ];
    state.days = [
      day({
        ratings: { mood: -2, eis: null },
        sleepHours: "0",
        sleepMinutes: "0",
      }),
    ];
    const week = buildWeekOverview(state, "2026-10-13");
    assert.deepEqual(week.coverage.checkin, { total: 3, mood: 2, pans: 1 });
    assert.deepEqual(week.coverage.after, { total: 1, mood: 0, pans: 1 });
    assert.deepEqual(week.coverage.day, { total: 1, mood: 1, pans: 0 });
    assert.deepEqual(
      week.days[6].observations.map((value) => [
        value.kind,
        value.ratings.mood,
      ]),
      [
        ["checkin", 0],
        ["after", null],
        ["checkin", null],
        ["checkin", 2],
        ["day", -2],
      ],
    );
    assert.equal(week.recordedDays, 1);
  });

  it("telt nametingen op hun eigen datum, ook wanneer de check-in buiten de week valt", () => {
    const state = createEmptyState();
    state.moments = [
      moment("previous-week", {
        date: "2026-10-06",
        after: { mood: -1, eis: null },
        afterDate: "2026-10-07",
        afterTime: "10:00",
      }),
      moment("future-followup", {
        after: { mood: 1, eis: null },
        afterDate: "2026-10-14",
        afterTime: "10:00",
      }),
      moment("future-checkin", { date: "2026-10-14" }),
    ];
    const week = buildWeekOverview(state, "2026-10-13");
    assert.equal(week.coverage.checkin.total, 1);
    assert.equal(week.coverage.after.total, 1);
    assert.equal(week.days[0].observations[0].id, "previous-week:after");
    assert.equal(week.recordedDays, 2);
  });

  it("houdt gedeeltelijke slaapregistraties onvolledig en onderscheidt ingevulde nul", () => {
    assert.equal(sleepDescription(day()), "niet ingevuld");
    assert.equal(
      sleepDescription(day({ sleepHours: "0", sleepMinutes: "0" })),
      "0 uur en 0 minuten",
    );
    assert.equal(
      sleepDescription(day({ sleepHours: "7" })),
      "7 uur · minuten niet ingevuld (onvolledig)",
    );
    assert.equal(
      sleepDescription(day({ sleepMinutes: "30" })),
      "uren niet ingevuld · 30 minuten (onvolledig)",
    );
  });

  it("rekent cravings en kleine momenten afzonderlijk mee zonder activiteit of uitkomst af te leiden", () => {
    const state = createEmptyState();
    state.cravings = [
      {
        id: "craving",
        date: "2026-10-12",
        time: "14:00",
        substance: "Cocaïne",
        situation: "",
        thought: "",
        bodySensation: "",
        emotion: "",
        behavior: "Rust nemen",
      },
      {
        id: "outside",
        date: "2026-10-06",
        time: "14:00",
        situation: "",
        thought: "",
        bodySensation: "",
        emotion: "",
        behavior: "",
      },
    ];
    state.growth = [
      {
        id: "rest",
        date: "2026-10-11",
        text: "Een grens aangegeven",
        favorite: false,
      },
    ];
    const week = buildWeekOverview(state, "2026-10-13");
    assert.equal(week.cravings, 1);
    assert.equal(week.growth, 1);
    assert.equal(week.recordedDays, 2);
    assert.equal(week.coverage.checkin.total, 0);
    assert.equal(week.days[4].growth[0].text, "Een grens aangegeven");
  });

  it("wijzigt of sorteert geen opgeslagen records, instellingen of arrays", () => {
    const state = createEmptyState();
    state.moments = [
      moment("late", { time: "18:00" }),
      moment("early", { time: "08:00" }),
    ];
    state.plan.action = "Rust nemen";
    state.revision = 8;
    const original = JSON.stringify(state);
    Object.freeze(state.moments);
    Object.freeze(state);
    buildWeekOverview(state, "2026-10-13");
    assert.equal(JSON.stringify(state), original);
  });
});
