import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { withCravingSubstances } from "../src/lib/substances.ts";
import {
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  clearDraftStorage,
  createEmptyState,
  draftStorageWarning,
  exportBackup,
  exportDraftRecovery,
  hasUnpersistedDrafts,
  loadDrafts,
  loadState,
  parseBackup,
  replaceFromBackup,
  saveDraft,
  saveState,
  validateState,
  type AppState,
  type CravingRecord,
} from "../src/lib/storage.ts";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  writes: string[] = [];
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
  assert.equal(clearDraftStorage(null).ok, true);
  store.values.clear();
  store.writes = [];
  loadState();
});

function record(id = "craving-1"): CravingRecord {
  return {
    id,
    date: "2026-10-14",
    time: "18:42",
    situation: "Synthetische situatie",
    thought: "Ik wil even pauze",
    bodySensation: "Spanning",
    emotion: "Nerveus",
    behavior: "Ik heb gebruikt volgens mijn eigen notitie.",
  };
}

function stateWith(cravings: CravingRecord[]): AppState {
  return { ...createEmptyState(), cravings };
}

describe("explicit use marker on a saved craving", () => {
  it("leaves legacy records, free text and raw storage untouched without inferring use", () => {
    const state = stateWith([
      record("without-substance"),
      { ...record("legacy-name"), substance: "  Eigen naam  " },
      { ...record("multiple"), substances: ["Alcohol", "Cocaine"] },
      { ...record("empty-array"), substances: [] },
    ]);
    const raw = JSON.stringify(state, null, 2);
    const draftRaw = JSON.stringify({
      version: 1,
      records: { "craving:new": { ...record(), date: "", time: "" } },
    });
    store.values.set(STORAGE_KEY, raw);
    store.values.set(DRAFT_STORAGE_KEY, draftRaw);
    const loaded = loadState();
    assert.equal(loaded.blocked, false);
    assert.deepEqual(loaded.state, state);
    assert.deepEqual(loadDrafts(), JSON.parse(draftRaw).records);
    assert.deepEqual(parseBackup(exportBackup(loaded.state)), state);
    for (const craving of loaded.state.cravings)
      assert.equal(Object.hasOwn(craving, "usedAfterCraving"), false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    assert.deepEqual(store.writes, []);
    const saved = saveState({ ...loaded.state, theme: "light" });
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.state!.cravings, state.cravings);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
  });

  it("round-trips explicit true with every substance shape without inferring which substance was used", () => {
    const state = stateWith([
      { ...record("missing"), usedAfterCraving: true },
      {
        ...record("scalar"),
        substance: "Eigen middel",
        usedAfterCraving: true,
      },
      {
        ...record("array"),
        substances: ["Cocaine", "3-MMC"],
        usedAfterCraving: true,
      },
      { ...record("empty"), substances: [], usedAfterCraving: true },
      record("unknown"),
    ]);
    const original = structuredClone(state);
    const saved = saveState(state);
    assert.equal(saved.ok, true);
    assert.deepEqual(state, original);
    assert.deepEqual(loadState().state, saved.state);
    const backup = exportBackup(saved.state!);
    assert.deepEqual(parseBackup(backup), saved.state);
    assert.deepEqual(
      parseBackup(JSON.stringify(JSON.parse(backup), null, 2)),
      saved.state,
    );
    assert.equal(saveDraft("craving:new", record("draft")).ok, true);
    const draftRaw = store.values.get(DRAFT_STORAGE_KEY);
    const restored = replaceFromBackup(
      parseBackup(backup),
      saved.state!.revision,
    );
    assert.equal(restored.ok, true);
    assert.deepEqual(restored.state!.cravings, state.cravings);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
  });

  it("rejects all present values except literal true before changing saved data, drafts or backups", () => {
    const saved = saveState(stateWith([record()])).state!;
    assert.equal(saveDraft("craving:new", record()).ok, true);
    const raw = store.values.get(STORAGE_KEY);
    const draftRaw = store.values.get(DRAFT_STORAGE_KEY);
    for (const value of [false, null, undefined, 0, 1, "true", "", [], {}]) {
      const candidate = structuredClone(saved);
      Object.assign(candidate.cravings[0], { usedAfterCraving: value });
      assert.throws(() => validateState(candidate), /gebruiksmarkering/);
      assert.equal(saveState(candidate).ok, false);
      assert.equal(saveDraft("craving:new", candidate.cravings[0]).ok, false);
      if (value !== undefined) {
        const backup = JSON.parse(exportBackup(saved));
        backup.state.cravings[0].usedAfterCraving = value;
        assert.throws(
          () => parseBackup(JSON.stringify(backup)),
          /gebruiksmarkering/,
        );
      }
      assert.equal(store.values.get(STORAGE_KEY), raw);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
      assert.deepEqual(loadDrafts()["craving:new"], saved.cravings[0]);
      assert.equal(hasUnpersistedDrafts(), false);
    }
  });

  it("keeps strict unknown-field rejection and never resets malformed stored records", () => {
    for (const addition of [
      { usedAfterCraving: false },
      { usedAfterCraving: true, usedSubstance: "Do not infer this" },
    ]) {
      const candidate = stateWith([record()]);
      Object.assign(candidate.cravings[0], addition);
      const raw = JSON.stringify(candidate);
      const draftRaw = JSON.stringify({
        version: 1,
        records: { "craving:new": candidate.cravings[0] },
      });
      store.values.set(STORAGE_KEY, raw);
      store.values.set(DRAFT_STORAGE_KEY, draftRaw);
      assert.equal(loadState().blocked, true);
      assert.equal(saveState(stateWith([record()])).ok, false);
      assert.ok(draftStorageWarning());
      assert.equal(JSON.parse(exportDraftRecovery()).raw, draftRaw);
      assert.equal(store.values.get(STORAGE_KEY), raw);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    }
    assert.deepEqual(store.writes, []);
  });

  it("preserves the marker and unfinished input in drafts while leaving an older draft unmarked", () => {
    const olderDraft = { ...record("older"), date: "", time: "" };
    const markedDraft: CravingRecord = {
      ...record("marked"),
      date: "2026-",
      time: "",
      substances: ["  Eigen middel  ", "", "alcohol", "Alcohol"],
      usedAfterCraving: true,
    };
    assert.equal(saveDraft("craving:older", olderDraft).ok, true);
    assert.equal(saveDraft("craving:marked", markedDraft).ok, true);
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    assert.deepEqual(loadDrafts(), {
      "craving:older": olderDraft,
      "craving:marked": markedDraft,
    });
    assert.equal(draftStorageWarning(), null);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    assert.equal(
      Object.hasOwn(
        loadDrafts()["craving:older"] as object,
        "usedAfterCraving",
      ),
      false,
    );
  });

  it("retains a marked draft and its recovery copy when storage writes fail", () => {
    const original = record();
    assert.equal(saveDraft("craving:craving-1", original).ok, true);
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    store.failWrite = true;
    const edited: CravingRecord = {
      ...original,
      usedAfterCraving: true,
      thought: "Mijn niet-opgeslagen aanpassing",
    };
    assert.equal(saveDraft("craving:craving-1", edited).ok, false);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    assert.deepEqual(loadDrafts()["craving:craving-1"], edited);
    const recovery = JSON.parse(exportDraftRecovery());
    assert.equal(recovery.raw, raw);
    assert.deepEqual(recovery.pendingRecords["craving:craving-1"], edited);
    store.failWrite = false;
    assert.equal(saveDraft("craving:craving-1", edited).ok, true);
    assert.equal(hasUnpersistedDrafts(), false);
  });

  it("preserves the marker when changing substance choices on a copied record", () => {
    const marked: CravingRecord = {
      ...record(),
      substance: "Alcohol",
      usedAfterCraving: true,
    };
    const original = structuredClone(marked);
    for (const names of [[], ["Eigen naam"], ["Cocaine", "3-MMC"]]) {
      const changed = withCravingSubstances(marked, names);
      assert.equal(changed.usedAfterCraving, true);
      assert.equal(changed.behavior, original.behavior);
      assert.deepEqual(
        validateState(stateWith([changed])).cravings[0],
        changed,
      );
      assert.deepEqual(marked, original);
    }
  });

  it("can explicitly remove only the marker, keeping the rest of the record and history", () => {
    const original = stateWith([
      {
        ...record("marked"),
        substances: ["Alcohol", "Cocaine"],
        usedAfterCraving: true,
      },
      record("other"),
    ]);
    const saved = saveState(original).state!;
    const unmarked = { ...saved.cravings[0] };
    delete unmarked.usedAfterCraving;
    const updated = saveState({
      ...saved,
      cravings: [unmarked, saved.cravings[1]],
    });
    assert.equal(updated.ok, true);
    assert.deepEqual(loadState().state.cravings, [
      unmarked,
      original.cravings[1],
    ]);
    assert.equal(
      Object.hasOwn(updated.state!.cravings[0], "usedAfterCraving"),
      false,
    );
    assert.equal(saved.cravings[0].usedAfterCraving, true);
    assert.deepEqual(parseBackup(exportBackup(updated.state!)), updated.state);
  });

  it("retains a saved marker if a stale revision or failed write tries to replace the record", () => {
    const first = saveState(stateWith([record()])).state!;
    const marked = saveState({
      ...first,
      cravings: [{ ...first.cravings[0], usedAfterCraving: true }],
    }).state!;
    const raw = store.values.get(STORAGE_KEY);
    assert.equal(saveState(first).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    store.failWrite = true;
    const unmarked = { ...marked.cravings[0] };
    delete unmarked.usedAfterCraving;
    assert.equal(saveState({ ...marked, cravings: [unmarked] }).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(loadState().state.cravings[0].usedAfterCraving, true);
  });
});

describe("optional explicit craving confirmation timestamp", () => {
  const confirmedAt = "2026-10-14T17:08:32.456Z";

  it("keeps older true markers without a timestamp unchanged in data, drafts, backups and unrelated saves", () => {
    const legacy: CravingRecord = { ...record(), usedAfterCraving: true };
    const state = stateWith([legacy, record("unmarked")]);
    const raw = JSON.stringify(state, null, 2);
    const draftRaw = JSON.stringify({
      version: 1,
      records: { "craving:craving-1": legacy },
    });
    store.values.set(STORAGE_KEY, raw);
    store.values.set(DRAFT_STORAGE_KEY, draftRaw);
    const loaded = loadState();
    assert.equal(loaded.blocked, false);
    assert.deepEqual(loaded.state, state);
    assert.deepEqual(loadDrafts()["craving:craving-1"], legacy);
    assert.deepEqual(parseBackup(exportBackup(loaded.state)), state);
    assert.equal(
      Object.hasOwn(loaded.state.cravings[0], "usedConfirmedAt"),
      false,
    );
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    assert.deepEqual(store.writes, []);
    const saved = saveState({ ...loaded.state, theme: "light" });
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.state!.cravings, state.cravings);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
  });

  it("round-trips canonical UTC timestamps without inferring a use time or rewriting historical records", () => {
    const timestamps = [
      "1900-01-01T00:00:00.000Z",
      "2000-02-29T23:59:59.999Z",
      confirmedAt,
      "2199-12-31T23:59:59.999Z",
    ];
    const state = stateWith(
      timestamps.map((usedConfirmedAt, index) => ({
        ...record(`timestamp-${index}`),
        substances: ["Alcohol", "Cocaine"],
        usedAfterCraving: true,
        usedConfirmedAt,
      })),
    );
    const original = structuredClone(state);
    const saved = saveState(state);
    assert.equal(saved.ok, true);
    assert.deepEqual(state, original);
    assert.deepEqual(loadState().state, saved.state);
    assert.deepEqual(parseBackup(exportBackup(saved.state!)), saved.state);
    const restored = replaceFromBackup(
      parseBackup(exportBackup(saved.state!)),
      saved.state!.revision,
    );
    assert.equal(restored.ok, true);
    assert.deepEqual(restored.state!.cravings, original.cravings);
    assert.deepEqual(
      restored.state!.cravings.map((entry) => entry.usedConfirmedAt),
      timestamps,
    );
  });

  it("rejects malformed, noncanonical and out-of-range timestamps without modifying valid state or drafts", () => {
    const marked: CravingRecord = {
      ...record(),
      usedAfterCraving: true,
      usedConfirmedAt: confirmedAt,
    };
    const saved = saveState(stateWith([marked])).state!;
    assert.equal(saveDraft("craving:craving-1", marked).ok, true);
    const raw = store.values.get(STORAGE_KEY);
    const draftRaw = store.values.get(DRAFT_STORAGE_KEY);
    const invalidTimes = [
      null,
      undefined,
      false,
      0,
      [],
      {},
      new Date(confirmedAt),
      "",
      "2026-10-14",
      "2026-10-14T17:08:32Z",
      "2026-10-14T17:08:32.45Z",
      "2026-10-14T17:08:32.4560Z",
      "2026-10-14T19:08:32.456+02:00",
      "2026-10-14t17:08:32.456z",
      "2026-10-14T24:00:00.000Z",
      "2026-10-14T17:08:60.000Z",
      "2026-13-01T17:08:32.456Z",
      "2026-02-29T17:08:32.456Z",
      "2100-02-29T17:08:32.456Z",
      "1899-12-31T23:59:59.999Z",
      "2200-01-01T00:00:00.000Z",
      "+010000-01-01T00:00:00.000Z",
      ` ${confirmedAt}`,
      "x".repeat(1000),
    ];
    for (const value of invalidTimes) {
      const candidate = structuredClone(saved);
      Object.assign(candidate.cravings[0], { usedConfirmedAt: value });
      assert.throws(() => validateState(candidate), /bevestigingstijdstip/i);
      assert.equal(saveState(candidate).ok, false);
      assert.equal(
        saveDraft("craving:craving-1", candidate.cravings[0]).ok,
        false,
      );
      // JSON cannot represent undefined or a Date object as those input types.
      if (value !== undefined && !(value instanceof Date)) {
        const backup = JSON.parse(exportBackup(saved));
        backup.state.cravings[0].usedConfirmedAt = value;
        assert.throws(
          () => parseBackup(JSON.stringify(backup)),
          /bevestigingstijdstip/i,
        );
      }
      assert.equal(store.values.get(STORAGE_KEY), raw);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
      assert.deepEqual(loadDrafts()["craving:craving-1"], marked);
      assert.equal(hasUnpersistedDrafts(), false);
    }
  });

  it("rejects an orphan timestamp instead of inferring a true use marker", () => {
    const saved = saveState(stateWith([record()])).state!;
    const raw = store.values.get(STORAGE_KEY);
    const candidate = structuredClone(saved);
    candidate.cravings[0].usedConfirmedAt = confirmedAt;
    assert.throws(
      () => validateState(candidate),
      /vereist een gebruiksmarkering/,
    );
    assert.equal(saveState(candidate).ok, false);
    assert.equal(
      saveDraft("craving:craving-1", candidate.cravings[0]).ok,
      false,
    );
    const backup = JSON.parse(exportBackup(saved));
    backup.state.cravings[0].usedConfirmedAt = confirmedAt;
    assert.throws(
      () => parseBackup(JSON.stringify(backup)),
      /vereist een gebruiksmarkering/,
    );
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(store.values.has(DRAFT_STORAGE_KEY), false);
  });

  it("keeps invalid stored confirmation bytes available for recovery rather than clearing them", () => {
    const invalidRecord = {
      ...record(),
      usedAfterCraving: true,
      usedConfirmedAt: "not an instant",
    };
    const stateRaw = JSON.stringify({
      ...createEmptyState(),
      cravings: [invalidRecord],
    });
    const draftRaw = JSON.stringify({
      version: 1,
      records: { "craving:craving-1": invalidRecord },
    });
    store.values.set(STORAGE_KEY, stateRaw);
    store.values.set(DRAFT_STORAGE_KEY, draftRaw);
    assert.equal(loadState().blocked, true);
    assert.equal(saveState(stateWith([record()])).ok, false);
    assert.ok(draftStorageWarning());
    assert.equal(JSON.parse(exportDraftRecovery()).raw, draftRaw);
    assert.equal(store.values.get(STORAGE_KEY), stateRaw);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    assert.deepEqual(store.writes, []);
  });

  it("preserves confirmation time with unfinished draft input and in recovery after a write failure", () => {
    const draft: CravingRecord = {
      ...record(),
      date: "2026-",
      time: "",
      substances: ["Alcohol", ""],
      usedAfterCraving: true,
      usedConfirmedAt: confirmedAt,
    };
    assert.equal(saveDraft("craving:craving-1", draft).ok, true);
    assert.deepEqual(loadDrafts()["craving:craving-1"], draft);
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    store.failWrite = true;
    const changed = { ...draft, thought: "Nog niet opgeslagen tekst" };
    assert.equal(saveDraft("craving:craving-1", changed).ok, false);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    assert.deepEqual(loadDrafts()["craving:craving-1"], changed);
    const recovery = JSON.parse(exportDraftRecovery());
    assert.equal(recovery.raw, raw);
    assert.deepEqual(recovery.pendingRecords["craving:craving-1"], changed);
    store.failWrite = false;
    assert.equal(saveDraft("craving:craving-1", changed).ok, true);
    assert.deepEqual(loadDrafts()["craving:craving-1"], changed);
  });

  it("preserves confirmation metadata on copied edits and requires both fields to be removed together", () => {
    const marked: CravingRecord = {
      ...record(),
      substance: "Alcohol",
      usedAfterCraving: true,
      usedConfirmedAt: confirmedAt,
    };
    const changed = withCravingSubstances(marked, ["Cocaine", "Eigen naam"]);
    assert.equal(changed.usedConfirmedAt, confirmedAt);
    assert.equal(changed.usedAfterCraving, true);
    const saved = saveState(stateWith([changed, record("other")])).state!;
    const raw = store.values.get(STORAGE_KEY);
    const unmarked = { ...saved.cravings[0] };
    delete unmarked.usedAfterCraving;
    assert.equal(
      saveState({ ...saved, cravings: [unmarked, saved.cravings[1]] }).ok,
      false,
    );
    assert.equal(store.values.get(STORAGE_KEY), raw);
    delete unmarked.usedConfirmedAt;
    const removed = saveState({
      ...saved,
      cravings: [unmarked, saved.cravings[1]],
    });
    assert.equal(removed.ok, true);
    assert.deepEqual(loadState().state.cravings, [unmarked, record("other")]);
    assert.equal(
      Object.hasOwn(removed.state!.cravings[0], "usedAfterCraving"),
      false,
    );
    assert.equal(
      Object.hasOwn(removed.state!.cravings[0], "usedConfirmedAt"),
      false,
    );
    assert.equal(marked.usedConfirmedAt, confirmedAt);
    assert.deepEqual(parseBackup(exportBackup(removed.state!)), removed.state);
  });
});
