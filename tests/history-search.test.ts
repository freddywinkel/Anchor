import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterHistoryTimeline,
  queryHistory,
  type HistorySearchCriteria,
} from "../src/lib/historySearch.ts";
import {
  createEmptyState,
  type CravingRecord,
  type Day,
  type Moment,
} from "../src/lib/storage.ts";

const criteria: HistorySearchCriteria = {
  period: "all",
  kind: "all",
  query: "",
  currentDate: "2026-10-20",
};

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
    time: "11:00",
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
    note: "Een fictief dagoverzicht.",
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

describe("dezelfde zoekcontext voor geschiedenis, grafiek en gekozen dag", () => {
  it("vindt dagoverzichten op hun huidige naam en behoudt de vroegere benamingen", () => {
    const state = createEmptyState();
    state.days = [day({ note: "" })];
    state.moments = [moment("other")];
    state.growth = [
      { id: "growth", date: "2026-10-20", text: "Rust nemen", favorite: false },
    ];
    for (const query of [
      "dagoverzicht",
      "dagoverzichten",
      "mijn hele dag",
      "dagsamenvatting",
    ]) {
      const result = queryHistory(state, { ...criteria, query });
      assert.deepEqual(
        result.entries.map((entry) => entry.type),
        ["day"],
      );
      assert.deepEqual(
        filterHistoryTimeline(state, "2026-10-20", { kind: "all", query }).map(
          (event) => event.kind,
        ),
        ["day"],
      );
      assert.deepEqual(result.observations, []);
      assert.equal(result.followupCount, 0);
    }
  });

  it("vindt een klein moment als enige registratie, zonder scores of tijd te verzinnen", () => {
    const state = createEmptyState();
    state.growth = [
      {
        id: "growth",
        date: "2026-10-20",
        text: "Zeedistel wandeling als klein moment",
        favorite: false,
      },
    ];
    for (const kind of ["all", "growth"] as const) {
      const result = queryHistory(state, {
        ...criteria,
        kind,
        query: "  ZEEDISTEL  ",
      });
      assert.deepEqual(result, {
        entries: [
          {
            type: "growth",
            item: state.growth[0],
            date: "2026-10-20",
            time: "",
          },
        ],
        observations: [],
        followupCount: 0,
      });
      const timeline = filterHistoryTimeline(state, "2026-10-20", {
        kind,
        query: "Zeedistel",
      });
      assert.equal(timeline.length, 1);
      assert.equal(timeline[0].kind, "growth");
      assert.equal(timeline[0].time, null);
    }
    assert.equal(
      queryHistory(state, { ...criteria, kind: "checkin", query: "Zeedistel" })
        .entries.length,
      0,
    );
    assert.equal(
      filterHistoryTimeline(state, "2026-10-20", {
        kind: "day",
        query: "Zeedistel",
      }).length,
      0,
    );
  });

  it("houdt alle bronsoorten vindbaar, maar telt een nameting niet als tweede bronkaart", () => {
    const state = createEmptyState();
    state.moments = [
      moment("moment", {
        note: "zoekterm",
        before: { mood: 0, eis: null },
        after: { mood: 2, eis: null },
        afterDate: "2026-10-20",
        afterTime: "14:00",
      }),
    ];
    state.cravings = [craving("craving", { thought: "zoekterm" })];
    state.days = [day({ note: "zoekterm", ratings: { mood: -2, eis: null } })];
    state.growth = [
      { id: "growth", date: "2026-10-20", text: "zoekterm", favorite: true },
    ];
    const result = queryHistory(state, { ...criteria, query: "zoekterm" });
    assert.deepEqual(
      result.entries.map((entry) => entry.type),
      ["moment", "craving", "day", "growth"],
    );
    assert.equal(result.followupCount, 1);
    assert.deepEqual(
      result.observations.map((observation) => [
        observation.id,
        observation.time,
        observation.mood,
      ]),
      [
        ["moment-before", "12:00", 0],
        ["moment-after", "14:00", 2],
      ],
    );
    // Day summaries have their own time-free ratings, not moment observations.
    assert.equal(
      result.observations.some((observation) => observation.mood === -2),
      false,
    );
    const timeline = filterHistoryTimeline(state, "2026-10-20", {
      kind: "all",
      query: "zoekterm",
    });
    assert.deepEqual(
      timeline.map((event) => event.kind),
      ["craving", "checkin", "after", "day", "growth"],
    );
    for (const [kind, expectedKinds] of [
      ["checkin", ["checkin", "after"]],
      ["craving", ["craving"]],
      ["day", ["day"]],
      ["growth", ["growth"]],
    ] as const) {
      const filtered = queryHistory(state, {
        ...criteria,
        query: "zoekterm",
        kind,
      });
      assert.equal(filtered.entries.length, 1);
      assert.equal(filtered.followupCount, kind === "checkin" ? 1 : 0);
      assert.equal(filtered.observations.length, kind === "checkin" ? 2 : 0);
      assert.deepEqual(
        filterHistoryTimeline(state, "2026-10-20", {
          kind,
          query: "zoekterm",
        }).map((event) => event.kind),
        expectedKinds,
      );
    }
  });

  it("zoekt middelen via de expliciete koppeling, nooit via dezelfde dag, een doel of verweesde ID", () => {
    const state = createEmptyState();
    state.cravings = [
      craving("multiple", { substances: ["Cocaine", "3-MMC"] }),
      craving("legacy", { substance: "Alcohol" }),
    ];
    state.moments = [
      moment("linked", {
        cravingId: "multiple",
        before: { mood: 0, eis: null },
      }),
      moment("scalar", {
        cravingId: "legacy",
        before: { mood: -1, eis: null },
      }),
      moment("unlinked", { before: { mood: 2, eis: null } }),
      moment("orphan", {
        cravingId: "removed",
        before: { mood: 1, eis: null },
      }),
    ];
    state.goals = [
      {
        id: "goal",
        target: "Cocaine",
        name: "Cocaine",
        direction: "stoppen",
        note: "",
      },
    ];
    for (const [query, id] of [
      ["cocaine", "linked"],
      ["3-mmc", "linked"],
      ["alcohol", "scalar"],
    ]) {
      const result = queryHistory(state, {
        ...criteria,
        kind: "checkin",
        query,
      });
      assert.deepEqual(
        result.entries.map((entry) =>
          "id" in entry.item ? entry.item.id : entry.item.date,
        ),
        [id],
      );
      assert.deepEqual(
        result.observations.map((observation) => observation.id),
        [`${id}-before`],
      );
      assert.deepEqual(
        filterHistoryTimeline(state, "2026-10-20", {
          kind: "checkin",
          query,
        }).map((event) => event.recordId),
        [id],
      );
    }
    state.cravings = [];
    assert.deepEqual(queryHistory(state, { ...criteria, query: "Cocaine" }), {
      entries: [],
      observations: [],
      followupCount: 0,
    });
    assert.equal(state.moments[0].cravingId, "multiple");
    assert.equal(state.moments[3].cravingId, "removed");
  });

  it("gebruikt gevonden context van een check-in voor beide echte meetmomenten", () => {
    const state = createEmptyState();
    state.moments = [
      moment("matched", {
        before: { mood: -1, eis: null },
        after: {
          mood: 0,
          eis: null,
          emotionRatings: [{ id: "emotion", label: "Hoopvol", intensity: 0 }],
        },
        afterDate: "2026-10-20",
        afterTime: "15:00",
      }),
      moment("other", { before: { mood: 2, eis: null } }),
    ];
    const result = queryHistory(state, { ...criteria, query: "hoopvol" });
    assert.equal(result.entries.length, 1);
    assert.deepEqual(
      result.observations.map((observation) => observation.id),
      ["matched-before", "matched-after"],
    );
    assert.deepEqual(
      filterHistoryTimeline(state, "2026-10-20", {
        kind: "checkin",
        query: "hoopvol",
      }).map((event) => event.id),
      ["checkin:matched", "after:matched"],
    );
    assert.deepEqual(
      queryHistory(state, { ...criteria, query: "niet aanwezig" }),
      { entries: [], observations: [], followupCount: 0 },
    );
  });

  it("behoudt bestaande vindbaarheid van vrije tekst, oude emotiewoorden, pannetjes en gebruiksmarkering", () => {
    const state = createEmptyState();
    state.moments = [
      moment("words", {
        activity: "Schilderen",
        emotions: ["Opgelucht"],
        before: { mood: null, eis: 78, pans: 3 },
      }),
    ];
    state.cravings = [
      craving("use", { usedAfterCraving: true }),
      craving("unknown"),
    ];
    for (const query of ["schilderen", "opgelucht", "pannetjes 3/5"]) {
      assert.equal(
        queryHistory(state, { ...criteria, query }).entries.length,
        1,
      );
      assert.equal(
        filterHistoryTimeline(state, "2026-10-20", { kind: "all", query })
          .length,
        1,
      );
    }
    const used = queryHistory(state, { ...criteria, query: "gebruikt" });
    assert.equal(used.entries.length, 1);
    assert.equal(used.entries[0].type, "craving");
    if (used.entries[0].type === "craving")
      assert.equal(used.entries[0].item.id, "use");
    assert.equal(used.observations.length, 0);
  });
});

describe("eerlijk periodeselectie en ontbrekende waarden", () => {
  it("houdt een oude bronkaart vindbaar via de nameting, met alleen de meting binnen de week", () => {
    const state = createEmptyState();
    state.moments = [
      moment("cross-week", {
        date: "2026-10-01",
        before: { mood: -2, eis: 80 },
        after: { mood: 0, eis: null },
        afterDate: "2026-10-20",
        afterTime: "08:00",
      }),
    ];
    const result = queryHistory(state, { ...criteria, period: "week" });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].date, "2026-10-01");
    assert.equal(result.followupCount, 1);
    assert.deepEqual(result.observations, [
      {
        id: "cross-week-after",
        date: "2026-10-20",
        time: "08:00",
        mood: 0,
        label: "Nameting",
      },
    ]);
    assert.deepEqual(
      filterHistoryTimeline(state, "2026-10-20", {
        kind: "checkin",
        query: "",
      }).map((event) => event.kind),
      ["after"],
    );
    assert.deepEqual(
      filterHistoryTimeline(state, "2026-10-01", {
        kind: "checkin",
        query: "",
      }).map((event) => event.kind),
      ["checkin"],
    );
  });

  it("laat een nameting buiten de gekozen week uit grafiek en telling, zonder de bronkaart te verliezen", () => {
    const state = createEmptyState();
    state.moments = [
      moment("future-after", {
        before: { mood: 1, eis: null },
        after: { mood: 2, eis: null },
        afterDate: "2026-10-21",
        afterTime: "08:00",
      }),
    ];
    const week = queryHistory(state, { ...criteria, period: "week" });
    assert.equal(week.entries.length, 1);
    assert.equal(week.followupCount, 0);
    assert.deepEqual(
      week.observations.map((observation) => observation.id),
      ["future-after-before"],
    );
    const all = queryHistory(state, criteria);
    assert.equal(all.followupCount, 1);
    assert.equal(all.observations.length, 2);
  });

  it("onderscheidt een echte nulscore van een bewaarde nameting zonder stemming", () => {
    const state = createEmptyState();
    state.moments = [
      moment("zero", {
        before: { mood: 0, eis: 0 },
        after: { mood: null, eis: null, pans: 5 },
        afterDate: "2026-10-20",
        afterTime: "13:00",
      }),
      moment("empty", {
        before: {
          mood: null,
          eis: 100,
          emotionRatings: [{ id: "e", label: "Rustig", intensity: 0 }],
        },
      }),
    ];
    const result = queryHistory(state, criteria);
    assert.equal(result.entries.length, 2);
    assert.equal(result.followupCount, 1);
    assert.deepEqual(
      result.observations.map((observation) => [
        observation.id,
        observation.mood,
      ]),
      [["zero-before", 0]],
    );
    const events = filterHistoryTimeline(state, "2026-10-20", {
      kind: "checkin",
      query: "",
    });
    assert.equal(events.length, 3);
    assert.equal(events.find((event) => event.kind === "after")?.time, "13:00");
  });

  it("verzint defensief geen datum of tijd voor een onvolledige historische nameting", () => {
    const state = createEmptyState();
    // The saved-state validator rejects these incomplete shapes; the projection
    // still must not fabricate a timestamp if it ever receives legacy data.
    state.moments = [
      moment("unknown-date", {
        after: { mood: 2, eis: null },
        afterTime: "15:00",
      }),
      moment("unknown-time", {
        after: { mood: 1, eis: null },
        afterDate: "2026-10-20",
      }),
    ];
    const result = queryHistory(state, criteria);
    assert.equal(result.entries.length, 2);
    assert.equal(result.followupCount, 1);
    assert.deepEqual(result.observations, []);
    const afterEvents = filterHistoryTimeline(state, "2026-10-20", {
      kind: "checkin",
      query: "",
    }).filter((event) => event.kind === "after");
    assert.equal(afterEvents.length, 1);
    assert.equal(afterEvents[0].recordId, "unknown-time");
    assert.equal(afterEvents[0].time, null);
  });

  it("gebruikt zeven inclusieve kalenderdagen en actualiseert de grens met currentDate", () => {
    const state = createEmptyState();
    state.growth = ["13", "14", "20", "21"].map((date) => ({
      id: date,
      date: `2026-10-${date}`,
      text: "test",
      favorite: false,
    }));
    const search = (currentDate: string) =>
      queryHistory(state, {
        ...criteria,
        period: "week",
        currentDate,
      }).entries.map((entry) => entry.date);
    assert.deepEqual(search("2026-10-20"), ["2026-10-20", "2026-10-14"]);
    assert.deepEqual(search("2026-10-21"), ["2026-10-21", "2026-10-20"]);
    assert.equal(queryHistory(state, criteria).entries.length, 4);
  });

  it("respecteert jaar-, schrikkel- en zomertijdgrenzen zonder datums om te rekenen naar lokale tijd", () => {
    for (const [currentDate, firstIncluded, beforeWeek] of [
      ["2027-01-03", "2026-12-28", "2026-12-27"],
      ["2024-03-03", "2024-02-26", "2024-02-25"],
      ["2026-10-27", "2026-10-21", "2026-10-20"],
      ["2026-03-31", "2026-03-25", "2026-03-24"],
    ]) {
      const state = createEmptyState();
      state.moments = [
        moment("included", {
          date: firstIncluded,
          before: { mood: 0, eis: null },
        }),
        moment("excluded", {
          date: beforeWeek,
          before: { mood: 2, eis: null },
        }),
      ];
      const result = queryHistory(state, {
        ...criteria,
        period: "week",
        currentDate,
      });
      assert.deepEqual(
        result.entries.map((entry) => entry.date),
        [firstIncluded],
      );
      assert.equal(result.observations[0].date, firstIncluded);
    }
    for (const invalidDate of [
      "2026-02-29",
      "2026-10",
      "2026-10-20T12:00:00Z",
      "2200-01-01",
    ])
      assert.throws(
        () =>
          queryHistory(createEmptyState(), {
            ...criteria,
            currentDate: invalidDate,
          }),
        RangeError,
      );
  });

  it("behoudt gedeeltelijke slaapwaarden en maakt daar geen stemming of complete slaapduur van", () => {
    const state = createEmptyState();
    state.days = [
      day({
        date: "2026-10-19",
        sleepHours: "6",
        sleepMinutes: "",
        note: "uurdeel",
      }),
      day({
        date: "2026-10-20",
        sleepHours: "",
        sleepMinutes: "0",
        note: "minuutdeel",
      }),
    ];
    for (const query of ["uurdeel", "minuutdeel"]) {
      const result = queryHistory(state, { ...criteria, query });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].type, "day");
      assert.deepEqual(result.observations, []);
      const timeline = filterHistoryTimeline(state, result.entries[0].date, {
        kind: "day",
        query,
      });
      assert.equal(timeline[0].time, null);
      if (timeline[0].kind === "day") {
        assert.equal(
          timeline[0].day.sleepHours,
          query === "uurdeel" ? "6" : "",
        );
        assert.equal(
          timeline[0].day.sleepMinutes,
          query === "uurdeel" ? "" : "0",
        );
      }
    }
  });

  it("is een onveranderlijke projectie die oude velden, IDs en bronvolgorde exact bewaart", () => {
    const state = createEmptyState();
    state.moments = [
      moment("late:legacy", { time: "23:00", cravingId: "removed" }),
      moment("early", { time: "07:00", before: { mood: 0, eis: null } }),
    ];
    state.cravings = [craving("legacy", { substance: " Alcohol " })];
    state.days = [day({ sleepHours: "", sleepMinutes: "0" })];
    state.growth = [
      { id: "growth", date: "2026-10-20", text: "Rust nemen", favorite: true },
    ];
    const original = JSON.stringify(state);
    freezeDeep(state);
    const result = queryHistory(state, criteria);
    const timeline = filterHistoryTimeline(state, "2026-10-20", {
      kind: "all",
      query: "",
    });
    assert.equal(result.entries.length, 5);
    assert.equal(timeline.length, 5);
    result.entries.reverse();
    result.observations.reverse();
    timeline.reverse();
    assert.equal(JSON.stringify(state), original);
    assert.equal(Object.hasOwn(state.moments[1], "cravingId"), false);
    assert.equal(Object.hasOwn(state.cravings[0], "substances"), false);
    assert.equal(state.moments[0].cravingId, "removed");
  });
});
