import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  buildHistoryCalendar,
  historyDayTimeline,
  historyMonthForDate,
  shiftHistoryMonth,
} from "../src/lib/historyCalendar.ts";
import {
  createEmptyState,
  type CravingRecord,
  type Day,
  type Moment,
} from "../src/lib/storage.ts";

function moment(id: string, overrides: Partial<Moment> = {}): Moment {
  return {
    id,
    date: "2026-10-20",
    time: "12:00",
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Een synthetische notitie.",
    ...overrides,
  };
}

function craving(
  id: string,
  overrides: Partial<CravingRecord> = {},
): CravingRecord {
  return {
    id,
    date: "2026-10-20",
    time: "15:00",
    situation: "Een fictieve situatie.",
    thought: "",
    bodySensation: "",
    emotion: "",
    behavior: "",
    ...overrides,
  };
}

function day(overrides: Partial<Day> = {}): Day {
  return {
    date: "2026-10-20",
    ratings: { mood: null, eis: null },
    sleepHours: "",
    sleepMinutes: "",
    note: "Een synthetisch dagoverzicht.",
    ...overrides,
  };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

describe("kalendermaanden zonder tijdzoneverschuiving", () => {
  it("toont volledige maandag-eerst weken met 28, 35 of 42 cellen", () => {
    const state = createEmptyState();
    const compact = buildHistoryCalendar(state, "2021-02");
    assert.equal(compact.days.length, 28);
    assert.equal(compact.days[0].date, "2021-02-01");
    assert.equal(compact.days.at(-1)?.date, "2021-02-28");
    assert.ok(compact.days.every((cell) => cell.inMonth));

    const ordinary = buildHistoryCalendar(state, "2026-10");
    assert.equal(ordinary.days.length, 35);
    assert.deepEqual(
      ordinary.days
        .slice(0, 7)
        .map((cell) => [cell.date, cell.day, cell.inMonth]),
      [
        ["2026-09-28", 28, false],
        ["2026-09-29", 29, false],
        ["2026-09-30", 30, false],
        ["2026-10-01", 1, true],
        ["2026-10-02", 2, true],
        ["2026-10-03", 3, true],
        ["2026-10-04", 4, true],
      ],
    );
    assert.equal(ordinary.days.at(-1)?.date, "2026-11-01");
    assert.equal(ordinary.previousMonth, "2026-09");
    assert.equal(ordinary.nextMonth, "2026-11");

    const long = buildHistoryCalendar(state, "2026-08");
    assert.equal(long.days.length, 42);
    assert.equal(long.days[0].date, "2026-07-27");
    assert.equal(long.days.at(-1)?.date, "2026-09-06");
  });

  it("behoudt schrikkeldagen en weigert genormaliseerde of onvolledige datums", () => {
    for (const [month, expectedDays] of [
      ["1900-02", 28],
      ["2000-02", 29],
      ["2024-02", 29],
      ["2100-02", 28],
    ] as const)
      assert.equal(
        buildHistoryCalendar(createEmptyState(), month).days.filter(
          (cell) => cell.inMonth,
        ).length,
        expectedDays,
      );
    assert.equal(historyMonthForDate("2024-02-29"), "2024-02");
    assert.equal(historyMonthForDate("2000-02-29"), "2000-02");
    assert.equal(historyMonthForDate("1900-01-01"), "1900-01");
    assert.equal(historyMonthForDate("2199-12-31"), "2199-12");
    for (const value of [
      "1900-02-29",
      "2100-02-29",
      "2026-02-29",
      "2026-04-31",
      "2026-10-00",
      "2026-10-32",
      "2026-00-20",
      "2026-13-20",
      "1899-12-31",
      "2200-01-01",
      "2026-1-1",
      "2026-10",
      "2026-10-20T00:00:00Z",
      " 2026-10-20",
      "",
    ]) {
      assert.throws(() => historyMonthForDate(value), RangeError, value);
      assert.throws(
        () => historyDayTimeline(createEmptyState(), value),
        RangeError,
        value,
      );
    }
  });

  it("navigeert door jaargrenzen en maakt navigatie buiten het opslagbereik onmogelijk", () => {
    assert.equal(shiftHistoryMonth("2026-12", 1), "2027-01");
    assert.equal(shiftHistoryMonth("2027-01", -1), "2026-12");
    assert.equal(shiftHistoryMonth("2026-10", 12), "2027-10");
    assert.equal(shiftHistoryMonth("2026-10", -12), "2025-10");
    assert.equal(shiftHistoryMonth("2026-10", 0), "2026-10");
    assert.equal(shiftHistoryMonth("1900-01", -1), null);
    assert.equal(shiftHistoryMonth("2199-12", 1), null);
    assert.equal(shiftHistoryMonth("1900-01", 3599), "2199-12");
    assert.equal(shiftHistoryMonth("2199-12", -3599), "1900-01");
    assert.equal(shiftHistoryMonth("2026-10", Number.MAX_SAFE_INTEGER), null);
    assert.equal(shiftHistoryMonth("2026-10", -Number.MAX_SAFE_INTEGER), null);
    for (const offset of [0.5, NaN, Infinity, -Infinity])
      assert.throws(() => shiftHistoryMonth("2026-10", offset), RangeError);
    for (const month of [
      "2026-00",
      "2026-13",
      "2026-1",
      "1899-12",
      "2200-01",
      "",
    ])
      assert.throws(
        () => buildHistoryCalendar(createEmptyState(), month),
        RangeError,
      );

    const first = buildHistoryCalendar(createEmptyState(), "1900-01");
    assert.equal(first.previousMonth, null);
    assert.equal(first.days[0].date, "1900-01-01");
    const last = buildHistoryCalendar(createEmptyState(), "2199-12");
    assert.equal(last.nextMonth, null);
    assert.equal(last.days.find((cell) => cell.date === "2199-12-31")?.day, 31);
    for (const cell of last.days.filter((cell) => cell.date === null))
      assert.deepEqual(cell, {
        date: null,
        day: null,
        inMonth: false,
        counts: { checkin: 0, after: 0, craving: 0, day: 0, growth: 0 },
        total: 0,
        hasRecords: false,
      });
  });

  it("levert iedere ondersteunde maand volledig, aaneengesloten en zonder dubbele datums", () => {
    const state = createEmptyState();
    for (let year = 1900; year <= 2199; year++) {
      for (let month = 1; month <= 12; month++) {
        const name = `${year}-${String(month).padStart(2, "0")}`;
        const grid = buildHistoryCalendar(state, name);
        const expectedLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const inside = grid.days.filter((cell) => cell.inMonth);
        assert.ok([28, 35, 42].includes(grid.days.length), name);
        assert.equal(inside.length, expectedLength, name);
        assert.deepEqual(
          inside.map((cell) => cell.date),
          Array.from(
            { length: expectedLength },
            (_, index) => `${name}-${String(index + 1).padStart(2, "0")}`,
          ),
          name,
        );
        const realDates = grid.days
          .map((cell) => cell.date)
          .filter((value) => value !== null);
        assert.equal(new Set(realDates).size, realDates.length, name);
        for (const [index, date] of realDates.entries()) {
          assert.ok(date >= "1900-01-01" && date <= "2199-12-31", date);
          if (index)
            assert.equal(
              Date.parse(`${date}T00:00:00Z`) -
                Date.parse(`${realDates[index - 1]}T00:00:00Z`),
              86_400_000,
              name,
            );
        }
      }
    }
  });

  it("houdt dezelfde kalender bij zomertijd en in tijdzones aan beide kanten van de datumgrens", () => {
    const moduleUrl = new URL("../src/lib/historyCalendar.ts", import.meta.url)
      .href;
    const script = `import { buildHistoryCalendar, historyMonthForDate } from ${JSON.stringify(moduleUrl)};
      const state = { moments: [], cravings: [], days: [], growth: [] };
      console.log(JSON.stringify(['2026-03', '2026-10', '2011-12'].map(month => ({
        month,
        dates: buildHistoryCalendar(state, month).days.map(day => day.date),
        recordedMonth: historyMonthForDate(month + '-28')
      }))));`;
    let expected: string | undefined;
    for (const zone of [
      "UTC",
      "Europe/Amsterdam",
      "America/Los_Angeles",
      "Pacific/Kiritimati",
      "Pacific/Apia",
    ]) {
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script],
        {
          env: { ...process.env, TZ: zone },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, `${zone}: ${result.stderr}`);
      if (expected === undefined) expected = result.stdout;
      else assert.equal(result.stdout, expected, zone);
    }
  });
});

describe("opgeslagen gebeurtenissen in kalender en dagtijdlijn", () => {
  it("markeert alle soorten afzonderlijk zonder van ontbrekende scores voltooide antwoorden te maken", () => {
    const state = createEmptyState();
    state.moments = [
      moment("words-only"),
      moment("zero", {
        time: "09:00",
        before: {
          mood: 0,
          eis: 0,
          emotionRatings: [
            { id: "e-zero", label: "Rustig", intensity: 0 },
            { id: "e-empty", label: "Nerveus", intensity: null },
          ],
        },
        after: { mood: null, eis: null },
        afterDate: "2026-10-20",
        afterTime: "10:00",
        attempted: false,
      }),
    ];
    state.cravings = [craving("same-day")];
    state.days = [day({ sleepHours: "0", sleepMinutes: "" })];
    state.growth = [
      { id: "rest", date: "2026-10-20", text: "Rust nemen.", favorite: false },
    ];
    const cell = buildHistoryCalendar(state, "2026-10").days.find(
      (value) => value.date === "2026-10-20",
    )!;
    assert.deepEqual(cell.counts, {
      checkin: 2,
      after: 1,
      craving: 1,
      day: 1,
      growth: 1,
    });
    assert.equal(cell.total, 6);
    assert.equal(cell.hasRecords, true);
    const timeline = historyDayTimeline(state, "2026-10-20");
    assert.deepEqual(
      timeline.map((event) => [event.kind, event.time]),
      [
        ["checkin", "09:00"],
        ["after", "10:00"],
        ["checkin", "12:00"],
        ["craving", "15:00"],
        ["day", null],
        ["growth", null],
      ],
    );
    assert.equal(timeline[0].kind, "checkin");
    if (timeline[0].kind === "checkin") {
      assert.strictEqual(timeline[0].ratings, state.moments[1].before);
      assert.equal(timeline[0].ratings.mood, 0);
      assert.equal(timeline[0].ratings.eis, 0);
      assert.deepEqual(
        timeline[0].ratings.emotionRatings?.map((value) => value.intensity),
        [0, null],
      );
      assert.equal(timeline[0].moment.attempted, false);
    }
    assert.equal(timeline[1].kind, "after");
    if (timeline[1].kind === "after")
      assert.equal(timeline[1].ratings.mood, null);
    assert.equal(timeline[4].kind, "day");
    if (timeline[4].kind === "day") {
      assert.equal(timeline[4].day.sleepHours, "0");
      assert.equal(timeline[4].day.sleepMinutes, "");
    }
    const empty = buildHistoryCalendar(state, "2026-10").days.find(
      (value) => value.date === "2026-10-21",
    )!;
    assert.equal(empty.total, 0);
    assert.equal(empty.hasRecords, false);
    assert.deepEqual(historyDayTimeline(state, "2026-10-21"), []);
  });

  it("plaatst nametingen op hun eigen dag over maand- en jaargrenzen", () => {
    const state = createEmptyState();
    state.moments = [
      moment("year-crossing", {
        date: "2026-12-31",
        time: "23:55",
        after: { mood: 1, eis: null },
        afterDate: "2027-01-01",
        afterTime: "00:05",
      }),
      moment("month-crossing", {
        date: "2026-11-30",
        time: "22:00",
        after: { mood: 0, eis: null },
        afterDate: "2026-12-01",
        afterTime: "08:00",
      }),
    ];
    assert.deepEqual(
      historyDayTimeline(state, "2026-12-31").map((event) => event.kind),
      ["checkin"],
    );
    const nextYear = historyDayTimeline(state, "2027-01-01");
    assert.equal(nextYear.length, 1);
    assert.equal(nextYear[0].kind, "after");
    assert.equal(nextYear[0].time, "00:05");
    assert.equal(nextYear[0].recordId, "year-crossing");
    const december = buildHistoryCalendar(state, "2026-12");
    assert.equal(
      december.days.find((cell) => cell.date === "2026-12-01")?.counts.after,
      1,
    );
    assert.equal(
      december.days.find((cell) => cell.date === "2026-12-31")?.counts.after,
      0,
    );
    assert.equal(
      december.days.find((cell) => cell.date === "2027-01-01")?.counts.after,
      1,
    );
    assert.equal(
      december.days.find((cell) => cell.date === "2026-11-30")?.counts.checkin,
      1,
    );
  });

  it("verzint defensief geen datum of tijd bij onvolledige oude nametingen", () => {
    // Strict storage rejects these incomplete saved shapes today. A read-only
    // projection still must not turn an unknown historical part into a fact.
    const state = createEmptyState();
    state.moments = [
      moment("date-only", {
        after: { mood: null, eis: null },
        afterDate: "2026-10-21",
        afterTime: null,
      }),
      moment("time-only", {
        after: { mood: 0, eis: null },
        afterDate: null,
        afterTime: "15:30",
      }),
      moment("no-date-or-time", { after: { mood: null, eis: null } }),
    ];
    assert.equal(historyDayTimeline(state, "2026-10-20").length, 3);
    const followup = historyDayTimeline(state, "2026-10-21");
    assert.equal(followup.length, 1);
    assert.equal(followup[0].kind, "after");
    assert.equal(followup[0].recordId, "date-only");
    assert.equal(followup[0].time, null);
    const calendar = buildHistoryCalendar(state, "2026-10");
    assert.equal(
      calendar.days.find((cell) => cell.date === "2026-10-20")?.counts.after,
      0,
    );
    assert.equal(
      calendar.days.find((cell) => cell.date === "2026-10-21")?.counts.after,
      1,
    );
  });

  it("geeft kleine momenten zonder tijd of andere registraties een eigen marker", () => {
    const state = createEmptyState();
    state.growth = [
      {
        id: "boundary",
        date: "2026-10-20",
        text: "Ik gaf een grens aan.",
        favorite: true,
      },
    ];
    const cell = buildHistoryCalendar(state, "2026-10").days.find(
      (value) => value.date === "2026-10-20",
    )!;
    assert.equal(cell.hasRecords, true);
    assert.equal(cell.total, 1);
    assert.deepEqual(cell.counts, {
      checkin: 0,
      after: 0,
      craving: 0,
      day: 0,
      growth: 1,
    });
    assert.deepEqual(historyDayTimeline(state, "2026-10-20"), [
      {
        id: "growth:boundary",
        recordId: "boundary",
        kind: "growth",
        date: "2026-10-20",
        time: null,
        growth: state.growth[0],
      },
    ]);
  });

  it("leest geen concepten en maakt van een gebruiksbevestiging geen nieuw gebruikstijdstip", () => {
    const state = createEmptyState();
    state.cravings = [
      craving("confirmed", {
        usedAfterCraving: true,
        usedConfirmedAt: "2026-10-21T00:30:00.000Z",
      }),
    ];
    Object.defineProperty(state, "drafts", {
      get() {
        throw new Error("Concepten mogen niet gelezen worden.");
      },
    });
    Object.defineProperty(state, "records", {
      get() {
        throw new Error("Conceptrecords mogen niet gelezen worden.");
      },
    });
    const calendar = buildHistoryCalendar(state, "2026-10");
    assert.equal(
      calendar.days.find((cell) => cell.date === "2026-10-20")?.total,
      1,
    );
    assert.equal(
      calendar.days.find((cell) => cell.date === "2026-10-21")?.total,
      0,
    );
    assert.deepEqual(historyDayTimeline(state, "2026-10-21"), []);
    const events = historyDayTimeline(state, "2026-10-20");
    assert.equal(events[0].time, "15:00");
    if (events[0].kind === "craving")
      assert.strictEqual(events[0].craving, state.cravings[0]);
  });

  it("behoudt gelijke tijdstippen, geldige dubbele soort-IDs en alle brongegevens zonder mutatie", () => {
    const state = createEmptyState();
    state.moments = [
      moment("same:id", {
        cravingId: "same:id",
        before: { mood: 0, eis: null },
        after: { mood: null, eis: 0 },
        afterDate: "2026-10-20",
        afterTime: "12:00",
      }),
      moment("other", { cravingId: "deleted-craving" }),
    ];
    state.cravings = [
      craving("same:id", { time: "12:00", substances: ["Cocaine", "3-MMC"] }),
    ];
    state.days = [day()];
    state.growth = [
      {
        id: "same:id",
        date: "2026-10-20",
        text: "Zelfde ID in een andere collectie.",
        favorite: false,
      },
    ];
    const before = JSON.stringify(state);
    freezeDeep(state);
    const timeline = historyDayTimeline(state, "2026-10-20");
    assert.equal(new Set(timeline.map((event) => event.id)).size, 6);
    assert.deepEqual(
      timeline.map((event) => event.id),
      [
        "checkin:same:id",
        "after:same:id",
        "checkin:other",
        "craving:same:id",
        "day:2026-10-20",
        "growth:same:id",
      ],
    );
    timeline.reverse();
    buildHistoryCalendar(state, "2026-10").days.reverse();
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(
      state.moments.map((value) => value.id),
      ["same:id", "other"],
    );
  });

  it("laat registraties buiten de maand intact en verwerkt een grote opgeslagen geschiedenis volledig", () => {
    const state = createEmptyState();
    state.moments = Array.from({ length: 20_000 }, (_, index) =>
      moment(`record-${index}`, {
        date: index % 2 === 0 ? "2026-10-20" : "2026-01-01",
        time: "08:00",
      }),
    );
    const calendar = buildHistoryCalendar(state, "2026-10");
    const populated = calendar.days.filter((cell) => cell.hasRecords);
    assert.equal(populated.length, 1);
    assert.equal(populated[0].date, "2026-10-20");
    assert.equal(populated[0].total, 10_000);
    assert.equal(historyDayTimeline(state, "2026-10-20").length, 10_000);
    assert.equal(state.moments.length, 20_000);
    assert.equal(state.moments[1].date, "2026-01-01");
  });
});
