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
