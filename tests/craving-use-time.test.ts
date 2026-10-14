import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cravingUseConfirmation } from "../src/lib/cravingUse.ts";
import type { CravingRecord } from "../src/lib/storage.ts";

const originalTimeZone = process.env.TZ;
before(() => {
  process.env.TZ = "Europe/Amsterdam";
});
after(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function record(overrides: Partial<CravingRecord> = {}): CravingRecord {
  return {
    id: "synthetic-confirmation",
    date: "2026-10-14",
    time: "12:15",
    situation: "Synthetische situatie",
    thought: "",
    bodySensation: "",
    emotion: "",
    behavior: "Vrije notitie die geen gebruik bevestigt",
    ...overrides,
  };
}

describe("explicit craving confirmation time", () => {
  it("renders nothing for an unmarked craving, even when narrative mentions use", () => {
    assert.equal(
      cravingUseConfirmation(record({ behavior: "Gebruikt" })),
      null,
    );
  });

  it("does not invent confirmation times for legacy marked records", () => {
    const value = record({ usedAfterCraving: true });
    const before = structuredClone(value);
    assert.deepEqual(cravingUseConfirmation(value), {
      confirmedAt: null,
      confirmedAtLabel: "Bevestigingstijd niet bekend.",
      elapsedLabel: null,
    });
    assert.deepEqual(value, before);
    assert.equal(Object.hasOwn(value, "usedConfirmedAt"), false);
  });

  it("shows local confirmation date and time separately from elapsed time", () => {
    const value = record({
      usedAfterCraving: true,
      usedConfirmedAt: "2026-10-14T12:00:00.000Z",
    });
    const before = structuredClone(value);
    assert.deepEqual(cravingUseConfirmation(value), {
      confirmedAt: "2026-10-14T12:00:00.000Z",
      confirmedAtLabel: "Bevestigd op 14 oktober 2026 om 14:00",
      elapsedLabel: "1 uur en 45 minuten na de craving bevestigd.",
    });
    assert.deepEqual(value, before);
  });

  it("does not round a confirmation under one minute up to one minute", () => {
    assert.equal(
      cravingUseConfirmation(
        record({
          usedAfterCraving: true,
          usedConfirmedAt: "2026-10-14T10:15:59.999Z",
        }),
      )?.elapsedLabel,
      "Minder dan een minuut na de craving bevestigd.",
    );
  });

  it("formats singular minutes, hours and days without implying a use time", () => {
    for (const [timestamp, elapsedLabel] of [
      ["2026-10-14T10:16:00.000Z", "1 minuut"],
      ["2026-10-14T10:17:00.000Z", "2 minuten"],
      ["2026-10-14T11:15:00.000Z", "1 uur"],
      ["2026-10-14T11:16:00.000Z", "1 uur en 1 minuut"],
      ["2026-10-15T10:15:00.000Z", "1 dag"],
      ["2026-10-15T12:18:00.000Z", "1 dag, 2 uur en 3 minuten"],
      ["2026-10-16T10:15:00.000Z", "2 dagen"],
    ]) {
      assert.equal(
        cravingUseConfirmation(
          record({ usedAfterCraving: true, usedConfirmedAt: timestamp }),
        )?.elapsedLabel,
        `${elapsedLabel} na de craving bevestigd.`,
      );
    }
  });

  it("labels confirmation before the entered craving without a negative duration", () => {
    assert.equal(
      cravingUseConfirmation(
        record({
          usedAfterCraving: true,
          usedConfirmedAt: "2026-10-14T10:00:00.000Z",
        }),
      )?.elapsedLabel,
      "Vóór het genoteerde cravingmoment bevestigd.",
    );
  });

  it("formats the local calendar day when the UTC timestamp falls on another day", () => {
    assert.deepEqual(
      cravingUseConfirmation(
        record({
          date: "2026-10-15",
          time: "00:00",
          usedAfterCraving: true,
          usedConfirmedAt: "2026-10-14T22:30:00.000Z",
        }),
      ),
      {
        confirmedAt: "2026-10-14T22:30:00.000Z",
        confirmedAtLabel: "Bevestigd op 15 oktober 2026 om 00:30",
        elapsedLabel: "30 minuten na de craving bevestigd.",
      },
    );
  });

  it("shows a known confirmation without fabricating elapsed time for an incomplete craving draft", () => {
    assert.deepEqual(
      cravingUseConfirmation(
        record({
          date: "",
          time: "",
          usedAfterCraving: true,
          usedConfirmedAt: "2026-10-14T12:00:00.000Z",
        }),
      ),
      {
        confirmedAt: "2026-10-14T12:00:00.000Z",
        confirmedAtLabel: "Bevestigd op 14 oktober 2026 om 14:00",
        elapsedLabel: null,
      },
    );
  });

  it("defensively renders an unknown confirmation for an invalid timestamp", () => {
    assert.deepEqual(
      cravingUseConfirmation(
        record({ usedAfterCraving: true, usedConfirmedAt: "not-an-instant" }),
      ),
      {
        confirmedAt: null,
        confirmedAtLabel: "Bevestigingstijd niet bekend.",
        elapsedLabel: null,
      },
    );
  });

  it("does not fabricate elapsed time by normalizing impossible dates or clock-change times", () => {
    for (const [date, time] of [
      ["2026-02-30", "12:15"],
      ["2026-10-14", "25:00"],
      ["2026-03-29", "02:30"],
    ]) {
      assert.equal(
        cravingUseConfirmation(
          record({
            date,
            time,
            usedAfterCraving: true,
            usedConfirmedAt: "2026-10-14T12:00:00.000Z",
          }),
        )?.elapsedLabel,
        null,
      );
    }
  });
});
