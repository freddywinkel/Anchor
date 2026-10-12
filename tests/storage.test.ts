import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  createEmptyState,
  loadState,
  saveState,
  validateState,
  exportBackup,
  parseBackup,
  replaceFromBackup,
  loadDrafts,
  saveDraft,
  hasUnpersistedDrafts,
  draftStorageWarning,
  exportDraftRecovery,
  clearDraftStorage,
  today,
  clockTime,
  type AppState,
  type Moment,
  type CravingRecord,
} from "../src/lib/storage.ts";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  reads: string[] = [];
  writes: string[] = [];
  failRead = false;
  failWrite = false;
  get length(): number {
    throw new Error("Storage enumeration is forbidden");
  }
  key(): string | null {
    throw new Error("Storage enumeration is forbidden");
  }
  clear(): void {
    throw new Error("Storage clearing is forbidden");
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  getItem(key: string): string | null {
    this.reads.push(key);
    if (this.failRead) throw new Error("Unavailable storage");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("QuotaExceededError");
    this.writes.push(key);
    this.values.set(key, value);
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: store,
  });
  for (const key of Object.keys(loadDrafts())) saveDraft(key, null);
  saveDraft("plan", null);
  store.values.clear();
  store.reads = [];
  store.writes = [];
  loadState();
});

function makeMoment(id = "moment-1", date = "2026-10-12"): Moment {
  return {
    id,
    date,
    time: "16:20",
    kind: "checkin",
    before: { mood: 0, eis: 0 },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Een rustig moment.",
  };
}

function makeCraving(id = "craving-1"): CravingRecord {
  return {
    id,
    date: "2026-10-12",
    time: "16:30",
    situation: "Alleen thuis",
    thought: "Ik wil rust",
    bodySensation: "Spanning in mijn schouders",
    emotion: "Onrust",
    behavior: "Naar buiten gegaan",
  };
}

function populated(): AppState {
  return {
    ...createEmptyState(),
    moments: [makeMoment()],
    cravings: [makeCraving()],
    days: [
      {
        date: "2026-10-12",
        ratings: { mood: null, eis: 0 },
        sleepHours: "7",
        sleepMinutes: "30",
        note: "Mijn dag",
      },
    ],
    goals: [
      {
        id: "goal-1",
        target: "Other substance",
        name: "Eigen middel",
        direction: "minderen",
        note: "Kleine stappen",
      },
    ],
    growth: [
      {
        id: "growth-1",
        date: "2026-10-12",
        text: "Een wandeling gemaakt",
        favorite: true,
      },
    ],
    plan: {
      warning: "Onrust",
      action: "Wandelen",
      support: "Een vertrouwd persoon",
    },
    theme: "light",
    homeShowGrowth: false,
  };
}

describe("Anchor storage isolation and independent records", () => {
  it("starts empty and never reads, clears, or changes the previous app or preview", () => {
    store.values.set("anchor-recovery", "old app canary");
    store.values.set("anchor:design-preview:v1", "preview canary");
    const loaded = loadState();
    assert.equal(loaded.blocked, false);
    assert.equal(loaded.warning, null);
    assert.deepEqual(loaded.state, createEmptyState());
    assert.equal(store.values.get("anchor-recovery"), "old app canary");
    assert.equal(
      store.values.get("anchor:design-preview:v1"),
      "preview canary",
    );
    assert.ok(store.reads.every((key) => key === STORAGE_KEY));
    assert.equal(store.writes.length, 0);
  });

  it("preserves multiple moments, separate craving records, and one whole-day summary", () => {
    const state = populated();
    state.moments.push({ ...makeMoment("moment-2"), time: "17:00" });
    state.cravings.push({ ...makeCraving("craving-2"), time: "18:00" });
    const saved = saveState(state);
    assert.equal(saved.ok, true);
    assert.equal(saved.state?.revision, 1);
    const reloaded = loadState().state;
    assert.deepEqual(reloaded.moments, state.moments);
    assert.deepEqual(reloaded.cravings, state.cravings);
    assert.deepEqual(reloaded.days, state.days);
    assert.equal(reloaded.moments.length, 2);
    assert.equal(reloaded.cravings.length, 2);
    assert.equal(reloaded.days.length, 1);
  });

  it("retains null distinctly from zero and never fabricates a score", () => {
    const state = populated();
    state.moments[0].before = { mood: null, eis: 0 };
    assert.equal(saveState(state).ok, true);
    assert.deepEqual(loadState().state.moments[0].before, {
      mood: null,
      eis: 0,
    });
    assert.deepEqual(loadState().state.days[0].ratings, { mood: null, eis: 0 });
  });

  it("returns validated copies and does not mutate caller state", () => {
    const state = populated();
    const validated = validateState(state);
    validated.moments[0].note = "Changed copy";
    assert.equal(state.moments[0].note, "Een rustig moment.");
    const saved = saveState(state);
    assert.equal(saved.ok, true);
    assert.equal(state.revision, 0);
    assert.notEqual(saved.state, state);
  });

  it("a settings update preserves all records and custom names", () => {
    const first = saveState(populated()).state!;
    const second = saveState({ ...first, theme: "dark", homeShowGrowth: true });
    assert.equal(second.ok, true);
    assert.deepEqual(second.state?.moments, first.moments);
    assert.deepEqual(second.state?.cravings, first.cravings);
    assert.deepEqual(second.state?.goals, first.goals);
    assert.equal(second.state?.revision, 2);
  });

  it("uses real local calendar/time strings", () => {
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(clockTime(), /^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe("validation and safe failure", () => {
  it("rejects unknown fields instead of silently losing newer data", () => {
    const state = { ...populated(), futureField: "keep me" };
    assert.throws(() => validateState(state), /onbekende velden/);
    assert.equal(saveState(state).ok, false);
    assert.equal(store.writes.length, 0);
    const record = populated();
    Object.assign(record.cravings[0], { severity: 4 });
    assert.throws(() => validateState(record), /onbekende velden/);
  });

  it("rejects future schema versions, malformed scores and missing fields", () => {
    assert.throws(
      () => validateState({ ...populated(), version: 2 }),
      /gegevensversie/,
    );
    for (const eis of [-1, 101, NaN, Infinity, 0.5, "50"]) {
      const state = populated();
      Object.assign(state.moments[0].before, { eis });
      assert.throws(() => validateState(state));
    }
    const missing = populated() as unknown as Record<string, unknown>;
    delete missing.cravings;
    assert.throws(() => validateState(missing));
  });

  it("validates calendar dates, leap years, time and follow-up chronology", () => {
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "1899-12-31",
      "2200-01-01",
    ]) {
      const state = populated();
      state.cravings[0].date = value;
      assert.throws(() => validateState(state), /datum/i);
    }
    const leap = populated();
    leap.cravings[0].date = "2024-02-29";
    assert.doesNotThrow(() => validateState(leap));
    const badTime = populated();
    badTime.cravings[0].time = "24:00";
    assert.throws(() => validateState(badTime), /tijd/i);
    const earlier = populated();
    Object.assign(earlier.moments[0], {
      after: { mood: 1, eis: 10 },
      afterDate: "2026-10-12",
      afterTime: "15:00",
    });
    assert.throws(() => validateState(earlier), /vóór/);
    earlier.moments[0].afterDate = "2026-10-13";
    assert.doesNotThrow(() => validateState(earlier));
  });

  it("rejects incomplete follow-up metadata and sleep beyond one day", () => {
    const state = populated();
    state.moments[0].after = { mood: 1, eis: null };
    assert.throws(() => validateState(state), /mist de datum of tijd/);
    const sleep = populated();
    sleep.days[0].sleepHours = "24";
    assert.throws(() => validateState(sleep), /24 uur/);
    sleep.days[0].sleepMinutes = "0";
    assert.doesNotThrow(() => validateState(sleep));
  });

  it("rejects duplicate IDs and duplicate daily summaries", () => {
    const moments = populated();
    moments.moments.push(makeMoment());
    assert.throws(() => validateState(moments), /dubbele/);
    const cravings = populated();
    cravings.cravings.push(makeCraving());
    assert.throws(() => validateState(cravings), /dubbele/);
    const days = populated();
    days.days.push({ ...days.days[0] });
    assert.throws(() => validateState(days), /dubbele/);
  });

  it("rejects the reserved new-record route as an imported record ID", () => {
    const state = populated();
    state.cravings[0].id = "new";
    assert.throws(() => validateState(state), /identificatie/);
  });

  it("bounds individual fields and overall payload size", () => {
    const longText = populated();
    longText.cravings[0].thought = "x".repeat(4001);
    assert.throws(() => validateState(longText), /4000/);
    const large = createEmptyState();
    large.cravings = Array.from({ length: 510 }, (_, index) => ({
      ...makeCraving(`record-${index}`),
      thought: "x".repeat(4000),
    }));
    assert.throws(() => validateState(large), /te groot/);
    assert.equal(store.writes.length, 0);
  });

  it("preserves corrupt or future data and blocks all ordinary saves", () => {
    for (const raw of [
      "broken JSON",
      JSON.stringify({ ...populated(), version: 2 }),
      JSON.stringify({ ...populated(), future: true }),
    ]) {
      store.values.set(STORAGE_KEY, raw);
      const loaded = loadState();
      assert.equal(loaded.blocked, true);
      assert.match(loaded.warning!, /blijven bewaard/);
      assert.equal(saveState(createEmptyState()).ok, false);
      assert.equal(store.values.get(STORAGE_KEY), raw);
    }
  });

  it("reports unavailable reads as blocked rather than a successful empty app", () => {
    store.failRead = true;
    const loaded = loadState();
    assert.equal(loaded.blocked, true);
    assert.match(loaded.warning!, /niet lezen/);
    assert.equal(saveState(populated()).ok, false);
    assert.equal(store.writes.length, 0);
  });

  it("reports quota failure without overwriting old data or claiming success", () => {
    const saved = saveState(populated()).state!;
    const before = store.values.get(STORAGE_KEY);
    store.failWrite = true;
    const result = saveState({ ...saved, theme: "dark" });
    assert.equal(result.ok, false);
    assert.equal(result.state, undefined);
    assert.match(result.message!, /Opslaan is niet gelukt/);
    assert.equal(store.values.get(STORAGE_KEY), before);
  });

  it("rejects a stale revision including when external data was removed", () => {
    const first = saveState(populated()).state!;
    const second = saveState({ ...first, theme: "dark" }).state!;
    const result = saveState({ ...first, theme: "light" });
    assert.equal(result.ok, false);
    assert.equal(loadState().state.revision, second.revision);
    store.values.delete(STORAGE_KEY);
    assert.equal(saveState(second).ok, false);
    assert.equal(store.values.has(STORAGE_KEY), false);
  });

  it("never writes an overflowing revision that cannot be read back", () => {
    const state = { ...populated(), revision: Number.MAX_SAFE_INTEGER - 1 };
    store.values.set(STORAGE_KEY, JSON.stringify(state));
    assert.equal(saveState(state).ok, true);
    assert.equal(loadState().state.revision, Number.MAX_SAFE_INTEGER);
    const raw = store.values.get(STORAGE_KEY);
    assert.equal(saveState(loadState().state).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
  });
});

describe("validated backups and explicit restore", () => {
  it("round-trips every field without reading or writing storage", () => {
    const state = populated();
    const reads = store.reads.length;
    assert.deepEqual(parseBackup(exportBackup(state)), state);
    assert.equal(store.reads.length, reads);
    assert.equal(store.writes.length, 0);
  });

  it("rejects foreign, corrupt, unknown-field and future backups before mutation", () => {
    const before = saveState(populated()).state!;
    const raw = store.values.get(STORAGE_KEY);
    for (const input of [
      "not JSON",
      JSON.stringify(before),
      exportBackup(before).replace("anchor.app.backup", "anchor.preview"),
      exportBackup(before).replace('"version": 1', '"version": 2'),
    ]) {
      assert.throws(() => parseBackup(input));
      assert.equal(store.values.get(STORAGE_KEY), raw);
    }
    const invalid = { ...before, unwanted: true };
    assert.equal(replaceFromBackup(invalid, before.revision).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
  });

  it("restores valid data at a new local revision and rejects stale approval", () => {
    const original = saveState(populated()).state!;
    const imported = { ...populated(), revision: 600, theme: "dark" as const };
    const result = replaceFromBackup(imported, original.revision);
    assert.equal(result.ok, true);
    assert.equal(result.state?.revision, original.revision + 1);
    assert.equal(result.state?.theme, "dark");
    assert.equal(replaceFromBackup(imported, original.revision).ok, false);
  });

  it("allows explicit recovery from the exact corrupt snapshot that was opened", () => {
    store.values.set(STORAGE_KEY, "corrupt original");
    assert.equal(loadState().blocked, true);
    const result = replaceFromBackup(populated(), 0);
    assert.equal(result.ok, true);
    assert.equal(loadState().blocked, false);
    assert.deepEqual(loadState().state.cravings, populated().cravings);
  });

  it("does not overwrite corrupt bytes changed after opening", () => {
    store.values.set(STORAGE_KEY, "corrupt original");
    loadState();
    store.values.set(STORAGE_KEY, "different corrupt original");
    assert.equal(replaceFromBackup(populated(), 0).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), "different corrupt original");
  });

  it("preserves current data if a restore write fails", () => {
    const original = saveState(populated()).state!;
    const raw = store.values.get(STORAGE_KEY);
    store.failWrite = true;
    assert.equal(
      replaceFromBackup(createEmptyState(), original.revision).ok,
      false,
    );
    assert.equal(store.values.get(STORAGE_KEY), raw);
  });

  it("rejects prototype-polluting backup fields without affecting objects", () => {
    const raw = exportBackup(populated()).replace(
      '"state": {',
      '"state": {"__proto__":{"polluted":true},',
    );
    assert.throws(() => parseBackup(raw), /onbekende velden/);
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  });

  it("rejects an impossible export date instead of normalizing it", () => {
    const backup = JSON.parse(exportBackup(populated()));
    backup.exportedAt = "2026-02-31T12:00:00.000Z";
    assert.throws(() => parseBackup(JSON.stringify(backup)), /exportdatum/);
  });
});

describe("isolated reload-safe drafts", () => {
  it("round-trips all supported draft types and removes only the named draft", () => {
    const state = populated();
    const entries = {
      "moment:new": state.moments[0],
      "moment:moment-1": state.moments[0],
      "day:2026-10-12": state.days[0],
      "craving:new": state.cravings[0],
      "craving:craving-1": state.cravings[0],
      plan: state.plan,
      goal: state.goals[0],
      growth: state.growth[0],
    };
    for (const [key, value] of Object.entries(entries))
      assert.equal(saveDraft(key, value).ok, true);
    assert.deepEqual(loadDrafts(), entries);
    assert.equal(saveDraft("moment:new", null).ok, true);
    const remaining = { ...entries } as Record<string, unknown>;
    delete remaining["moment:new"];
    assert.deepEqual(loadDrafts(), remaining);
    assert.equal(store.values.has(STORAGE_KEY), false);
    assert.ok(store.writes.every((key) => key === DRAFT_STORAGE_KEY));
  });

  it("permits an unfinished follow-up in a draft without accepting it as saved data", () => {
    const value = { ...makeMoment(), after: { mood: 1, eis: null } };
    assert.equal(saveDraft("moment:new", value).ok, true);
    assert.deepEqual(loadDrafts()["moment:new"], value);
    const state = createEmptyState();
    state.moments.push(value);
    assert.equal(saveState(state).ok, false);
  });

  it("rejects invalid keys, mismatched IDs, malformed shape and oversized text", () => {
    assert.equal(saveDraft("other-app-key", {}).ok, false);
    assert.equal(saveDraft("__proto__", {}).ok, false);
    assert.equal(saveDraft("day:2026-02-29", null).ok, false);
    assert.equal(saveDraft("moment:wrong-id", makeMoment()).ok, false);
    assert.equal(
      saveDraft("craving:new", { thought: "partial shape" }).ok,
      false,
    );
    assert.equal(
      saveDraft("plan", { warning: "x".repeat(4001), action: "", support: "" })
        .ok,
      false,
    );
    assert.equal(store.values.has(DRAFT_STORAGE_KEY), false);
  });

  it("never clears or overwrites unreadable drafts", () => {
    for (const raw of [
      "invalid JSON",
      JSON.stringify({ version: 2, records: {} }),
      JSON.stringify({ version: 1, records: { "craving:new": null } }),
    ]) {
      store.values.delete(DRAFT_STORAGE_KEY);
      saveDraft("plan", null);
      store.values.set(DRAFT_STORAGE_KEY, raw);
      assert.deepEqual(loadDrafts(), {});
      assert.equal(saveDraft("plan", populated().plan).ok, false);
      assert.deepEqual(loadDrafts().plan, populated().plan);
      assert.equal(saveDraft("plan", null).ok, false);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    }
  });

  it("reports draft write failure and retains the previous draft", () => {
    saveDraft("craving:new", makeCraving());
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    store.failWrite = true;
    const result = saveDraft("craving:new", {
      ...makeCraving(),
      behavior: "Nog iets",
    });
    assert.equal(result.ok, false);
    assert.match(result.message!, /Concept niet opgeslagen/);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
  });

  it("retains failed form edits across navigation and retries all pending drafts", () => {
    saveDraft("craving:new", makeCraving());
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    store.failWrite = true;
    const pending = { ...makeCraving(), behavior: "Een andere activiteit" };
    assert.equal(saveDraft("craving:new", pending).ok, false);
    assert.equal(saveDraft("plan", populated().plan).ok, false);
    assert.equal(hasUnpersistedDrafts(), true);
    assert.deepEqual(loadDrafts()["craving:new"], pending);
    assert.deepEqual(loadDrafts().plan, populated().plan);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    store.failWrite = false;
    assert.equal(saveDraft("growth", populated().growth[0]).ok, true);
    assert.equal(hasUnpersistedDrafts(), false);
    assert.deepEqual(loadDrafts()["craving:new"], pending);
    assert.deepEqual(loadDrafts().plan, populated().plan);
  });

  it("keeps temporarily incomplete input in drafts while blocking committed save", () => {
    const craving = { ...makeCraving(), date: "", time: "" };
    assert.equal(saveDraft("craving:new", craving).ok, true);
    assert.deepEqual(loadDrafts()["craving:new"], craving);
    const moment = { ...makeMoment(), before: { mood: 0, eis: 101.5 } };
    assert.equal(saveDraft("moment:new", moment).ok, true);
    assert.deepEqual(loadDrafts()["moment:new"], moment);
    const state = createEmptyState();
    state.cravings.push(craving);
    assert.equal(saveState(state).ok, false);
    const day = {
      ...populated().days[0],
      sleepHours: "123.5",
      sleepMinutes: "",
    };
    assert.equal(saveDraft("day:2026-10-12", day).ok, true);
    assert.deepEqual(loadDrafts()["day:2026-10-12"], day);
    assert.equal(saveState({ ...createEmptyState(), days: [day] }).ok, false);
  });

  it("keeps a failed draft removal visible until it succeeds", () => {
    saveDraft("craving:new", makeCraving());
    store.failWrite = true;
    assert.equal(saveDraft("craving:new", null).ok, false);
    assert.equal(hasUnpersistedDrafts(), true);
    assert.deepEqual(loadDrafts()["craving:new"], makeCraving());
    store.failWrite = false;
    assert.equal(saveDraft("craving:new", null).ok, true);
    assert.equal(hasUnpersistedDrafts(), false);
    assert.equal(loadDrafts()["craving:new"], undefined);
  });

  it("announces successful and failed draft writes without claiming persistence", () => {
    const target = new EventTarget();
    const statuses: boolean[] = [];
    target.addEventListener("anchor-draft-status", (event) => {
      statuses.push(
        (event as CustomEvent<{ unpersisted: boolean }>).detail.unpersisted,
      );
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: target,
    });
    try {
      saveDraft("plan", populated().plan);
      store.failWrite = true;
      saveDraft("plan", { ...populated().plan, warning: "Aangepast" });
      store.failWrite = false;
      saveDraft("plan", null);
      assert.deepEqual(statuses, [false, true, false]);
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("exports corrupt draft bytes and pending edits together without mutation", () => {
    const corrupt = "Unreadable original bytes {";
    store.values.set(DRAFT_STORAGE_KEY, corrupt);
    assert.match(draftStorageWarning()!, /oorspronkelijke gegevens/);
    assert.equal(saveDraft("craving:new", makeCraving()).ok, false);
    const rawBefore = store.values.get(DRAFT_STORAGE_KEY);
    const recovery = JSON.parse(exportDraftRecovery());
    assert.equal(recovery.format, "anchor.app.draft-recovery");
    assert.equal(recovery.raw, corrupt);
    assert.deepEqual(recovery.pendingRecords["craving:new"], makeCraving());
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), rawBefore);
    assert.equal(hasUnpersistedDrafts(), true);
  });

  it("requires the exact draft snapshot before an explicit reset", () => {
    store.values.set(DRAFT_STORAGE_KEY, "original");
    const snapshot = store.values.get(DRAFT_STORAGE_KEY)!;
    saveDraft("plan", populated().plan);
    store.values.set(DRAFT_STORAGE_KEY, "newer bytes");
    assert.equal(clearDraftStorage(snapshot).ok, false);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), "newer bytes");
    assert.deepEqual(loadDrafts().plan, populated().plan);
    assert.equal(hasUnpersistedDrafts(), true);
  });

  it("resets only the owned draft key and never changes committed or other-app data", () => {
    saveState(populated());
    const stateBefore = store.values.get(STORAGE_KEY);
    store.values.set("anchor-recovery", "untouched");
    store.values.set(DRAFT_STORAGE_KEY, "broken draft bytes");
    saveDraft("plan", populated().plan);
    assert.equal(clearDraftStorage("broken draft bytes").ok, true);
    assert.equal(hasUnpersistedDrafts(), false);
    assert.equal(draftStorageWarning(), null);
    assert.deepEqual(loadDrafts(), {});
    assert.equal(store.values.get(STORAGE_KEY), stateBefore);
    assert.equal(store.values.get("anchor-recovery"), "untouched");
    assert.equal(saveDraft("craving:new", makeCraving()).ok, true);
  });

  it("retains original and pending drafts when reset cannot write", () => {
    const original = "corrupt draft bytes";
    store.values.set(DRAFT_STORAGE_KEY, original);
    saveDraft("craving:new", makeCraving());
    store.failWrite = true;
    assert.equal(clearDraftStorage(original).ok, false);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), original);
    assert.deepEqual(loadDrafts()["craving:new"], makeCraving());
    assert.equal(hasUnpersistedDrafts(), true);
  });
});
