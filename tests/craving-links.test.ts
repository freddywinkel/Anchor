import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { eligibleCheckins } from "../src/lib/cravingLinks.ts";
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
  type Moment,
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

function craving(): CravingRecord {
  return {
    id: "craving-1",
    date: "2026-10-15",
    time: "18:30",
    substances: ["Alcohol", "Eigen middel"],
    situation: "Synthetische situatie",
    thought: "Een moment pauze",
    bodySensation: "",
    emotion: "Nerveus",
    behavior: "Naar buiten gegaan",
  };
}

function moment(id = "moment-1"): Moment {
  return {
    id,
    date: "2026-10-15",
    time: "19:10",
    kind: "checkin",
    before: {
      mood: 0,
      eis: null,
      emotionRatings: [
        { id: "emotion-first", label: "Mijn eigen gevoel", intensity: 0 },
        { id: "emotion-second", label: "Nerveus", intensity: null },
      ],
    },
    after: { mood: -1, eis: 0 },
    afterDate: "2026-10-15",
    afterTime: "20:00",
    activity: "Wandelen",
    attempted: true,
    emotions: [],
    note: "Synthetische notitie na een craving.",
  };
}

function populated(): AppState {
  return { ...createEmptyState(), moments: [moment()], cravings: [craving()] };
}

describe("optional check-in links to cravings", () => {
  it("preserves unlinked legacy data and draft bytes without inferring a link from time or notes", () => {
    const state = populated();
    const raw = JSON.stringify(state, null, 2);
    const oldDraft = { ...moment(), date: "", time: "" };
    const draftRaw = JSON.stringify({
      version: 1,
      records: { "moment:new": oldDraft },
    });
    store.values.set(STORAGE_KEY, raw);
    store.values.set(DRAFT_STORAGE_KEY, draftRaw);
    const loaded = loadState();
    assert.equal(loaded.blocked, false);
    assert.deepEqual(loaded.state, state);
    assert.deepEqual(loadDrafts()["moment:new"], oldDraft);
    assert.deepEqual(parseBackup(exportBackup(loaded.state)), state);
    assert.equal(Object.hasOwn(loaded.state.moments[0], "cravingId"), false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    assert.deepEqual(store.writes, []);
    const saved = saveState({ ...loaded.state, palette: "ocean" });
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.state!.moments, state.moments);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
  });

  it("round-trips multiple check-ins for one craving with every existing score, note and follow-up intact", () => {
    const original = populated();
    original.moments = [
      { ...moment("first"), cravingId: "craving-1" },
      { ...moment("second"), time: "19:30", cravingId: "craving-1" },
      { ...moment("uuid"), cravingId: "a73f963c-60a1-4930-b419-5a30f1055bd2" },
      { ...moment("maximum-id"), cravingId: "x".repeat(128) },
      moment("unlinked"),
    ];
    const snapshot = structuredClone(original);
    const saved = saveState(original);
    assert.equal(saved.ok, true);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(loadState().state, saved.state);
    assert.deepEqual(parseBackup(exportBackup(saved.state!)), saved.state);
    const restored = replaceFromBackup(
      parseBackup(exportBackup(saved.state!)),
      saved.state!.revision,
    );
    assert.equal(restored.ok, true);
    assert.deepEqual(restored.state!.moments, original.moments);
    assert.deepEqual(restored.state!.cravings, original.cravings);
  });

  it("rejects malformed or reserved IDs in data, drafts and backups before any mutation", () => {
    const saved = saveState(populated()).state!;
    assert.equal(saveDraft("moment:moment-1", saved.moments[0]).ok, true);
    const raw = store.values.get(STORAGE_KEY);
    const draftRaw = store.values.get(DRAFT_STORAGE_KEY);
    for (const id of [
      null,
      undefined,
      false,
      0,
      [],
      {},
      "",
      "new",
      "has space",
      "../escape",
      "é",
      "#fragment",
      "x".repeat(129),
    ]) {
      const candidate = structuredClone(saved);
      Object.assign(candidate.moments[0], { cravingId: id });
      assert.throws(() => validateState(candidate), /identificatie/i);
      assert.equal(saveState(candidate).ok, false);
      assert.equal(
        saveDraft("moment:moment-1", candidate.moments[0]).ok,
        false,
      );
      if (id !== undefined) {
        const backup = JSON.parse(exportBackup(saved));
        backup.state.moments[0].cravingId = id;
        assert.throws(
          () => parseBackup(JSON.stringify(backup)),
          /identificatie/i,
        );
      }
      assert.equal(store.values.get(STORAGE_KEY), raw);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
      assert.deepEqual(loadDrafts()["moment:moment-1"], saved.moments[0]);
      assert.equal(hasUnpersistedDrafts(), false);
    }
  });

  it("rejects new unknown fields and retains invalid link bytes for recovery rather than resetting data", () => {
    for (const addition of [
      { cravingId: "new" },
      { cravingIds: ["craving-1", "craving-2"] },
    ]) {
      const state = populated();
      Object.assign(state.moments[0], addition);
      const raw = JSON.stringify(state);
      const draftRaw = JSON.stringify({
        version: 1,
        records: { "moment:moment-1": state.moments[0] },
      });
      store.values.set(STORAGE_KEY, raw);
      store.values.set(DRAFT_STORAGE_KEY, draftRaw);
      assert.equal(loadState().blocked, true);
      assert.equal(saveState(populated()).ok, false);
      assert.ok(draftStorageWarning());
      assert.equal(JSON.parse(exportDraftRecovery()).raw, draftRaw);
      assert.equal(store.values.get(STORAGE_KEY), raw);
      assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    }
    assert.deepEqual(store.writes, []);
  });

  it("preserves linked moments and drafts after deleting a craving without enforcing chronology", () => {
    const original = populated();
    original.moments[0] = {
      ...moment(),
      date: "2026-10-14",
      cravingId: "craving-1",
    };
    const saved = saveState(original).state!;
    const draft = {
      ...saved.moments[0],
      note: "Mijn niet-afgemaakte tekst",
      time: "",
    };
    assert.equal(saveDraft("moment:moment-1", draft).ok, true);
    const draftRaw = store.values.get(DRAFT_STORAGE_KEY);
    const removed = saveState({ ...saved, cravings: [] });
    assert.equal(removed.ok, true);
    assert.deepEqual(loadState().state.moments, original.moments);
    assert.deepEqual(loadState().state.cravings, []);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), draftRaw);
    assert.deepEqual(loadDrafts()["moment:moment-1"], draft);
    assert.deepEqual(parseBackup(exportBackup(removed.state!)), removed.state);
    const unrelatedSave = saveState({ ...removed.state!, theme: "light" });
    assert.equal(unrelatedSave.ok, true);
    assert.equal(unrelatedSave.state!.moments[0].cravingId, "craving-1");
  });

  it("preserves a linked unfinished draft and an unlinked draft without creating a saved assessment", () => {
    const linked = {
      ...moment("linked-draft"),
      cravingId: "missing-craving",
      date: "2026-",
      time: "",
      afterDate: "",
      afterTime: "",
    };
    const unlinked = { ...moment("unlinked-draft"), date: "", time: "" };
    assert.equal(saveDraft("moment:linked-draft", linked).ok, true);
    assert.equal(saveDraft("moment:unlinked-draft", unlinked).ok, true);
    assert.deepEqual(loadDrafts(), {
      "moment:linked-draft": linked,
      "moment:unlinked-draft": unlinked,
    });
    assert.equal(draftStorageWarning(), null);
    assert.equal(
      Object.hasOwn(
        loadDrafts()["moment:unlinked-draft"] as object,
        "cravingId",
      ),
      false,
    );
    assert.equal(store.values.has(STORAGE_KEY), false);
    assert.deepEqual(loadState().state.moments, []);
  });

  it("retains an unsaved linked draft in memory and recovery export when persistence fails", () => {
    const original = moment();
    assert.equal(saveDraft("moment:moment-1", original).ok, true);
    const raw = store.values.get(DRAFT_STORAGE_KEY);
    const changed = {
      ...original,
      cravingId: "craving-1",
      note: "Mijn gewijzigde notitie",
    };
    store.failWrite = true;
    assert.equal(saveDraft("moment:moment-1", changed).ok, false);
    assert.equal(store.values.get(DRAFT_STORAGE_KEY), raw);
    assert.deepEqual(loadDrafts()["moment:moment-1"], changed);
    const recovery = JSON.parse(exportDraftRecovery());
    assert.equal(recovery.raw, raw);
    assert.deepEqual(recovery.pendingRecords["moment:moment-1"], changed);
    store.failWrite = false;
    assert.equal(saveDraft("moment:moment-1", changed).ok, true);
    assert.deepEqual(loadDrafts()["moment:moment-1"], changed);
    assert.equal(hasUnpersistedDrafts(), false);
  });

  it("keeps a committed link when a stale revision or failed write attempts to remove it", () => {
    const first = saveState(populated()).state!;
    const linked = saveState({
      ...first,
      moments: [{ ...first.moments[0], cravingId: "craving-1" }],
    }).state!;
    const raw = store.values.get(STORAGE_KEY);
    assert.equal(saveState(first).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    store.failWrite = true;
    assert.equal(saveState({ ...linked, moments: first.moments }).ok, false);
    assert.equal(store.values.get(STORAGE_KEY), raw);
    assert.equal(loadState().state.moments[0].cravingId, "craving-1");
  });

  it("can unlink a copied check-in without changing scores, follow-up, craving history or other moments", () => {
    const original = populated();
    original.moments = [
      { ...moment(), cravingId: "craving-1" },
      moment("other"),
    ];
    const saved = saveState(original).state!;
    const unlinked = { ...saved.moments[0] };
    delete unlinked.cravingId;
    const updated = saveState({
      ...saved,
      moments: [unlinked, saved.moments[1]],
    });
    assert.equal(updated.ok, true);
    assert.deepEqual(updated.state!.moments, [moment(), moment("other")]);
    assert.deepEqual(updated.state!.cravings, original.cravings);
    assert.equal(saved.moments[0].cravingId, "craving-1");
    assert.deepEqual(parseBackup(exportBackup(updated.state!)), updated.state);
  });
});

describe("eligible existing check-ins", () => {
  it("offers only unlinked check-ins on or after the craving, including the same minute and later dates", () => {
    const moments: Moment[] = [
      { ...moment("previous-date"), date: "2026-10-14", time: "23:59" },
      {
        ...moment("later-date"),
        date: "2026-10-16",
        time: "00:00",
        after: null,
        afterDate: null,
        afterTime: null,
      },
      { ...moment("earlier-minute"), time: "18:29" },
      { ...moment("same-minute"), time: "18:30" },
      { ...moment("linked-here"), cravingId: "craving-1" },
      { ...moment("linked-elsewhere"), cravingId: "craving-2" },
      { ...moment("orphan-link"), cravingId: "deleted-craving" },
      moment("later-today"),
    ];
    const input = {
      moments: Object.freeze(
        moments.map((entry) => Object.freeze(entry)),
      ) as unknown as Moment[],
    };
    const original = structuredClone(input);
    const eligible = eligibleCheckins(input, craving());
    assert.deepEqual(
      eligible.map((entry) => entry.id),
      ["later-date", "same-minute", "later-today"],
    );
    assert.deepEqual(input, original);
    eligible.reverse();
    assert.deepEqual(input, original);
    assert.deepEqual(eligibleCheckins({ moments: [] }, craving()), []);
  });
});
