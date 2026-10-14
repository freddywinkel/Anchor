import { PALETTE_IDS, isPalette, type Palette } from "./palettes.ts";

export const STORAGE_KEY = "anchor.app.data.v1";
export const DRAFT_STORAGE_KEY = "anchor.app.drafts.v1";

export type EmotionRating = {
  id: string;
  label: string;
  intensity: number | null;
};
export type Ratings = {
  mood: number | null;
  // Legacy, unlinked intensity. Never infer its emotion from other fields.
  eis: number | null;
  emotionRatings?: EmotionRating[];
  pans?: number | null;
};
export type Moment = {
  id: string;
  date: string;
  time: string;
  kind: "checkin";
  before: Ratings;
  after: Ratings | null;
  afterDate: string | null;
  afterTime: string | null;
  activity: string;
  attempted: boolean | null;
  emotions: string[];
  note: string;
};
export type Day = {
  date: string;
  ratings: Ratings;
  sleepHours: string;
  sleepMinutes: string;
  note: string;
};
export type CravingRecord = {
  id: string;
  date: string;
  time: string;
  substance?: string;
  situation: string;
  thought: string;
  bodySensation: string;
  emotion: string;
  behavior: string;
};
export type Goal = {
  id: string;
  target: string;
  name: string;
  direction: string;
  note: string;
};
export type Growth = {
  id: string;
  date: string;
  text: string;
  favorite: boolean;
};
export type AppState = {
  version: 1;
  revision: number;
  moments: Moment[];
  days: Day[];
  cravings: CravingRecord[];
  goals: Goal[];
  growth: Growth[];
  plan: { warning: string; action: string; support: string };
  theme: "dark" | "light";
  palette: Palette;
  homeShowGrowth: boolean;
};
export type SaveResult = {
  ok: boolean;
  state?: AppState;
  message: string | null;
};

// Stay below the usual localStorage quota. A failed write still leaves the
// browser's existing value untouched; callers must retain their form values.
const MAX_STATE_LENGTH = 2_000_000;
// Palette is additive v1 metadata. Leave the full existing payload allowance
// available so an older state at the limit remains readable after normalization.
const MAX_SERIALIZED_STATE_LENGTH =
  MAX_STATE_LENGTH + Math.max(...PALETTE_IDS.map(paletteStorageLength));
// Earlier releases indented exports. Dense emotion arrays can more than double
// in size from formatting alone; validate the decoded state against the same
// storage limit after this bounded input check.
const MAX_BACKUP_TEXT_LENGTH = 8_000_000;
const MAX_DRAFT_LENGTH = 256_000;
const MAX_RECORDS = 20_000;
const BACKUP_FORMAT = "anchor.app.backup";
let lastLoadedRaw: string | null | undefined;
const pendingDrafts = new Map<string, unknown>();
const pendingDraftRemovals = new Set<string>();

type JsonObject = Record<string, unknown>;
export type WriteResult = { ok: boolean; message: string | null };

function invalid(message: string): never {
  throw new Error(message);
}

function paletteStorageLength(palette: Palette): number {
  // The serialized property and its comma, without the enclosing braces.
  return JSON.stringify({ palette }).length - 1;
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(`${label} heeft geen geldige structuur.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(`${label} heeft geen geldige structuur.`);
  }
  return value as JsonObject;
}

function fields(
  value: unknown,
  keys: readonly string[],
  label: string,
): JsonObject {
  const item = object(value, label);
  const actual = Object.keys(item);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  ) {
    return invalid(`${label} bevat ontbrekende of onbekende velden.`);
  }
  return item;
}

function string(value: unknown, label: string, maximum = 4000): string {
  if (typeof value !== "string" || value.length > maximum) {
    return invalid(`${label} moet tekst zijn van maximaal ${maximum} tekens.`);
  }
  return value;
}

function identifier(value: unknown): string {
  const id = string(value, "Identificatie", 128);
  if (id === "new" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    return invalid("Een registratie heeft geen geldige identificatie.");
  }
  return id;
}

function date(value: unknown): string {
  const result = string(value, "Datum", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result))
    return invalid("Een datum is ongeldig.");
  const [year, month, day] = result.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2199 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    return invalid(
      "Een datum is ongeldig; gebruik een datum tussen 1900 en 2199.",
    );
  return result;
}

function time(value: unknown): string {
  const result = string(value, "Tijd", 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result))
    return invalid("Een tijd is ongeldig.");
  return result;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    return invalid(`${label} moet ja of nee zijn.`);
  return value;
}

function score(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalid(
      `${label} moet leeg zijn of een geheel getal tussen ${minimum} en ${maximum}.`,
    );
  }
  return value;
}

function emotionRating(value: unknown, draft: boolean): EmotionRating {
  const item = fields(value, ["id", "label", "intensity"], "Emotiescore");
  const label = string(item.label, "Emotie", 150);
  if (!draft && !label.trim())
    return invalid("Geef de emotie bij deze intensiteit een naam.");
  if (
    draft &&
    item.intensity !== null &&
    (typeof item.intensity !== "number" || !Number.isFinite(item.intensity))
  )
    return invalid("Emotionele intensiteit moet leeg zijn of een getal.");
  return {
    id: identifier(item.id),
    label,
    intensity: draft
      ? (item.intensity as number | null)
      : score(item.intensity, 0, 100, "Emotionele intensiteit"),
  };
}

function ratings(value: unknown, draft = false): Ratings {
  const input = object(value, "Scores");
  const hasEmotionRatings = Object.hasOwn(input, "emotionRatings");
  const hasPans = Object.hasOwn(input, "pans");
  const item = fields(
    input,
    [
      "mood",
      "eis",
      ...(hasEmotionRatings ? ["emotionRatings"] : []),
      ...(hasPans ? ["pans"] : []),
    ],
    "Scores",
  );
  if (
    draft &&
    item.eis !== null &&
    (typeof item.eis !== "number" || !Number.isFinite(item.eis))
  )
    return invalid("Emotionele intensiteit moet leeg zijn of een getal.");
  return {
    mood: score(item.mood, -2, 2, "Stemming"),
    eis: draft
      ? (item.eis as number | null)
      : score(item.eis, 0, 100, "Emotionele intensiteit"),
    // Keep older shapes unchanged, including backups and unfinished drafts.
    // Explicit empty arrays remain explicit; missing fields stay omitted.
    ...(hasEmotionRatings
      ? {
          emotionRatings: unique(
            list(
              item.emotionRatings,
              "Emotiescores",
              (entry) => emotionRating(entry, draft),
              20,
            ),
            (entry) => entry.id,
            "Emotiescores",
          ),
        }
      : {}),
    ...(hasPans ? { pans: score(item.pans, 1, 5, "Emotionele spanning") } : {}),
  };
}

function draftDate(value: unknown, draft: boolean): string {
  // A native date field can temporarily contain an empty or partial year while
  // being edited. Rejecting that draft would also lose its other form text.
  return draft ? string(value, "Conceptdatum", 32) : date(value);
}

function draftTime(value: unknown, draft: boolean): string {
  return draft ? string(value, "Concepttijd", 16) : time(value);
}

function list<T>(
  value: unknown,
  label: string,
  parse: (value: unknown) => T,
  maximum = MAX_RECORDS,
): T[] {
  if (!Array.isArray(value) || value.length > maximum)
    return invalid(`${label} bevat te veel of ongeldige registraties.`);
  return value.map(parse);
}

function unique<T>(items: T[], key: (item: T) => string, label: string): T[] {
  if (new Set(items.map(key)).size !== items.length)
    return invalid(`${label} bevat dubbele registraties.`);
  return items;
}

function moment(value: unknown, draft = false): Moment {
  const item = fields(
    value,
    [
      "id",
      "date",
      "time",
      "kind",
      "before",
      "after",
      "afterDate",
      "afterTime",
      "activity",
      "attempted",
      "emotions",
      "note",
    ],
    "Check-in",
  );
  if (item.kind !== "checkin")
    return invalid("Een check-in heeft een onbekend type.");
  const result: Moment = {
    id: identifier(item.id),
    date: draftDate(item.date, draft),
    time: draftTime(item.time, draft),
    kind: "checkin",
    before: ratings(item.before, draft),
    after: item.after === null ? null : ratings(item.after, draft),
    afterDate:
      item.afterDate === null ? null : draftDate(item.afterDate, draft),
    afterTime:
      item.afterTime === null ? null : draftTime(item.afterTime, draft),
    activity: string(item.activity, "Activiteit", 200),
    attempted:
      item.attempted === null
        ? null
        : bool(item.attempted, "Activiteit geprobeerd"),
    emotions: list(
      item.emotions,
      "Emoties",
      (entry) => string(entry, "Emotie", 150),
      30,
    ),
    note: string(item.note, "Notitie"),
  };
  if (!draft) {
    if (
      result.after === null &&
      (result.afterDate !== null || result.afterTime !== null)
    ) {
      return invalid("Een nameting bevat een tijdstip zonder scores.");
    }
    if (
      result.after !== null &&
      (result.afterDate === null || result.afterTime === null)
    ) {
      return invalid("Een nameting mist de datum of tijd.");
    }
    if (
      result.afterDate !== null &&
      result.afterTime !== null &&
      `${result.afterDate}T${result.afterTime}` <
        `${result.date}T${result.time}`
    ) {
      return invalid("Een nameting kan niet vóór de check-in liggen.");
    }
  }
  return result;
}

function sleep(value: unknown, maximum: number, label: string): string {
  const result = string(value, label, 2);
  if (
    result !== "" &&
    (!/^\d{1,2}$/.test(result) || Number(result) > maximum)
  ) {
    return invalid(
      `${label} moet leeg zijn of een geheel getal van 0 tot ${maximum}.`,
    );
  }
  return result;
}

function day(value: unknown, draft = false): Day {
  const item = fields(
    value,
    ["date", "ratings", "sleepHours", "sleepMinutes", "note"],
    "Dagafsluiting",
  );
  const result: Day = {
    date: draftDate(item.date, draft),
    ratings: ratings(item.ratings, draft),
    sleepHours: draft
      ? string(item.sleepHours, "Slaapuren", 32)
      : sleep(item.sleepHours, 24, "Slaapuren"),
    sleepMinutes: draft
      ? string(item.sleepMinutes, "Slaapminuten", 32)
      : sleep(item.sleepMinutes, 59, "Slaapminuten"),
    note: string(item.note, "Notitie"),
  };
  if (
    !draft &&
    Number(result.sleepHours) === 24 &&
    Number(result.sleepMinutes) > 0
  )
    return invalid("Slaapduur kan niet meer dan 24 uur zijn.");
  return result;
}

function craving(value: unknown, draft = false): CravingRecord {
  const input = object(value, "Drangregistratie");
  const hasSubstance = Object.hasOwn(input, "substance");
  const item = fields(
    input,
    [
      "id",
      "date",
      "time",
      "situation",
      "thought",
      "bodySensation",
      "emotion",
      "behavior",
      ...(hasSubstance ? ["substance"] : []),
    ],
    "Drangregistratie",
  );
  return {
    id: identifier(item.id),
    date: draftDate(item.date, draft),
    time: draftTime(item.time, draft),
    situation: string(item.situation, "Situatie"),
    thought: string(item.thought, "Gedachte"),
    bodySensation: string(item.bodySensation, "Lichamelijke sensatie"),
    emotion: string(item.emotion, "Emotie"),
    behavior: string(item.behavior, "Gedrag"),
    // Additive v1 field: never infer a substance for older records or drafts.
    ...(hasSubstance
      ? { substance: string(item.substance, "Middel", 120) }
      : {}),
  };
}

function goal(value: unknown): Goal {
  const item = fields(
    value,
    ["id", "target", "name", "direction", "note"],
    "Doel",
  );
  return {
    id: identifier(item.id),
    target: string(item.target, "Middel of gedrag", 200),
    name: string(item.name, "Eigen naam", 200),
    direction: string(item.direction, "Richting", 200),
    note: string(item.note, "Notitie"),
  };
}

function growth(value: unknown, draft = false): Growth {
  const item = fields(
    value,
    ["id", "date", "text", "favorite"],
    "Groeinotitie",
  );
  return {
    id: identifier(item.id),
    date: draftDate(item.date, draft),
    text: string(item.text, "Groeinotitie"),
    favorite: bool(item.favorite, "Favoriet"),
  };
}

function plan(value: unknown): AppState["plan"] {
  const item = fields(
    value,
    ["warning", "action", "support"],
    "Persoonlijk plan",
  );
  return {
    warning: string(item.warning, "Signaal"),
    action: string(item.action, "Actie"),
    support: string(item.support, "Steun"),
  };
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function clockTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function createEmptyState(): AppState {
  return {
    version: 1,
    revision: 0,
    moments: [],
    days: [],
    cravings: [],
    goals: [],
    growth: [],
    plan: { warning: "", action: "", support: "" },
    theme: "dark",
    palette: "amber",
    homeShowGrowth: true,
  };
}

/**
 * Reject unknown fields rather than silently dropping future-version data.
 * Palette is optional only in v1 input from older releases; output is normalized
 * to amber without writing storage or altering records, revisions, or drafts.
 */
export function validateState(value: unknown): AppState {
  const input = object(value, "Anchor-gegevens");
  const hasPalette = Object.hasOwn(input, "palette");
  const item = fields(
    input,
    [
      "version",
      "revision",
      "moments",
      "days",
      "cravings",
      "goals",
      "growth",
      "plan",
      "theme",
      "homeShowGrowth",
      ...(hasPalette ? ["palette"] : []),
    ],
    "Anchor-gegevens",
  );
  if (item.version !== 1)
    return invalid("Deze gegevensversie wordt nog niet ondersteund.");
  if (
    typeof item.revision !== "number" ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0
  )
    return invalid("De gegevensrevisie is ongeldig.");
  if (item.theme !== "dark" && item.theme !== "light")
    return invalid("Het gekozen thema is ongeldig.");
  const palette = hasPalette ? item.palette : "amber";
  if (!isPalette(palette))
    return invalid("Het gekozen kleurenpalet is ongeldig.");
  const state: AppState = {
    version: 1,
    revision: item.revision,
    moments: unique(
      list(item.moments, "Check-ins", (entry) => moment(entry)),
      (entry) => entry.id,
      "Check-ins",
    ),
    days: unique(
      list(item.days, "Dagafsluitingen", (entry) => day(entry)),
      (entry) => entry.date,
      "Dagafsluitingen",
    ),
    cravings: unique(
      list(item.cravings, "Drangregistraties", (entry) => craving(entry)),
      (entry) => entry.id,
      "Drangregistraties",
    ),
    goals: unique(
      list(item.goals, "Doelen", goal),
      (entry) => entry.id,
      "Doelen",
    ),
    growth: unique(
      list(item.growth, "Groeinotities", (entry) => growth(entry)),
      (entry) => entry.id,
      "Groeinotities",
    ),
    plan: plan(item.plan),
    theme: item.theme,
    palette,
    homeShowGrowth: bool(item.homeShowGrowth, "Groei op Vandaag"),
  };
  if (
    JSON.stringify(state).length - paletteStorageLength(palette) >
    MAX_STATE_LENGTH
  )
    return invalid(
      "Je gegevens zijn te groot voor de lokale opslag. Maak een back-up.",
    );
  return state;
}

function decodeState(raw: string): AppState {
  if (raw.length > MAX_SERIALIZED_STATE_LENGTH)
    return invalid("De opgeslagen gegevens zijn te groot.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid("De opgeslagen gegevens zijn niet leesbaar.");
  }
  return validateState(parsed);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function storage(): Storage {
  if (typeof globalThis.localStorage === "undefined")
    return invalid("Lokale opslag is niet beschikbaar in deze browser.");
  return globalThis.localStorage;
}

export function loadState(): {
  state: AppState;
  warning: string | null;
  blocked: boolean;
} {
  let raw: string | null;
  try {
    raw = storage().getItem(STORAGE_KEY);
    lastLoadedRaw = raw;
  } catch {
    lastLoadedRaw = undefined;
    return {
      state: createEmptyState(),
      warning:
        "Anchor kan de lokale opslag niet lezen. Opslaan is geblokkeerd; controleer je browserinstellingen.",
      blocked: true,
    };
  }
  if (raw === null)
    return { state: createEmptyState(), warning: null, blocked: false };
  try {
    return { state: decodeState(raw), warning: null, blocked: false };
  } catch (error) {
    return {
      state: createEmptyState(),
      warning: `${message(error, "De opgeslagen gegevens zijn ongeldig.")} Je bestaande gegevens blijven bewaard. Herstel een geldige Anchor-back-up om verder te gaan.`,
      blocked: true,
    };
  }
}

function writeState(state: AppState): SaveResult {
  try {
    const serialized = JSON.stringify(state);
    // Incrementing the revision can add a digit. Check the final serialized
    // value, so a successful save remains readable by decodeState next launch.
    if (
      serialized.length - paletteStorageLength(state.palette) >
      MAX_STATE_LENGTH
    )
      return {
        ok: false,
        message:
          "Je gegevens zijn te groot voor de lokale opslag. Er is niets overschreven. Maak een back-up voordat je verder gaat.",
      };
    storage().setItem(STORAGE_KEY, serialized);
    return { ok: true, state, message: null };
  } catch {
    return {
      ok: false,
      message:
        "Opslaan is niet gelukt. De opslag is vol of niet beschikbaar. Je invoer blijft in beeld; maak zo nodig een back-up.",
    };
  }
}

/** Callers hold the app's navigator.locks writer lock in addition to this check. */
export function saveState(next: AppState): SaveResult {
  let candidate: AppState;
  try {
    candidate = validateState(next);
  } catch (error) {
    return { ok: false, message: message(error, "De invoer is ongeldig.") };
  }
  if (candidate.revision === Number.MAX_SAFE_INTEGER)
    return {
      ok: false,
      message:
        "De maximale gegevensrevisie is bereikt. Maak een back-up voordat je verder gaat.",
    };
  try {
    const raw = storage().getItem(STORAGE_KEY);
    const current = raw === null ? createEmptyState() : decodeState(raw);
    if (current.revision !== candidate.revision)
      return {
        ok: false,
        message:
          "De gegevens zijn intussen gewijzigd. Herlaad Anchor voordat je verder opslaat. Je huidige invoer is nog niet opgeslagen.",
      };
  } catch {
    return {
      ok: false,
      message:
        "De bestaande gegevens kunnen niet veilig worden gelezen. Er is niets overschreven. Herstel eerst een geldige Anchor-back-up.",
    };
  }
  return writeState({ ...candidate, revision: candidate.revision + 1 });
}

export function exportBackup(state: AppState): string {
  const validated = validateState(state);
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    state: validated,
  });
}

export function parseBackup(text: string): AppState {
  if (typeof text !== "string" || text.length > MAX_BACKUP_TEXT_LENGTH)
    return invalid("Dit back-upbestand is te groot.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid("Dit bestand is geen leesbare JSON-back-up.");
  }
  const item = fields(
    parsed,
    ["format", "version", "exportedAt", "state"],
    "Back-up",
  );
  if (item.format !== BACKUP_FORMAT || item.version !== 1)
    return invalid("Dit is geen ondersteunde Anchor-back-up.");
  const exportedAt = string(item.exportedAt, "Exportdatum", 30);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    new Date(exportedAt).toISOString() !== exportedAt
  )
    return invalid("De exportdatum van deze back-up is ongeldig.");
  return validateState(item.state);
}

/** Restore is an explicit replacement, never an automatic load-time repair. */
export function replaceFromBackup(
  state: AppState,
  expectedRevision: number,
  expectedRaw?: string | null,
): SaveResult {
  let candidate: AppState;
  try {
    candidate = validateState(state);
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision >= Number.MAX_SAFE_INTEGER
    )
      return invalid("De verwachte gegevensrevisie is ongeldig.");
  } catch (error) {
    return { ok: false, message: message(error, "De back-up is ongeldig.") };
  }
  let raw: string | null;
  try {
    raw = storage().getItem(STORAGE_KEY);
  } catch {
    return {
      ok: false,
      message:
        "De lokale opslag is niet beschikbaar. De back-up is niet teruggezet.",
    };
  }
  // The UI supplies the exact snapshot offered as its pre-restore safety copy.
  // Background storage events may refresh lastLoadedRaw; they must not widen
  // the user's earlier approval to replacing different, newly observed bytes.
  if (expectedRaw !== undefined && raw !== expectedRaw)
    return {
      ok: false,
      message:
        "Je gegevens zijn gewijzigd sinds het downloaden van de veiligheidskopie. Download de huidige opslag opnieuw voordat je de back-up terugzet.",
    };
  let current: AppState | null = null;
  try {
    current = raw === null ? createEmptyState() : decodeState(raw);
  } catch {
    if (lastLoadedRaw === undefined || raw !== lastLoadedRaw) {
      return {
        ok: false,
        message:
          "De opgeslagen gegevens zijn veranderd sinds het openen. Herlaad Anchor en controleer de back-up opnieuw.",
      };
    }
  }
  if (current !== null && current.revision !== expectedRevision)
    return {
      ok: false,
      message:
        "De gegevens zijn intussen gewijzigd. Herlaad Anchor voordat je de back-up terugzet.",
    };
  const result = writeState({ ...candidate, revision: expectedRevision + 1 });
  if (result.ok && result.state) lastLoadedRaw = JSON.stringify(result.state);
  return result;
}

function draftValue(key: string, value: unknown): unknown {
  if (key === "plan") return plan(value);
  if (key === "goal") return goal(value);
  if (key === "growth") return growth(value, true);
  const match = /^(moment|day|craving):(.+)$/.exec(key);
  if (!match) return invalid("Dit concept heeft een onbekende naam.");
  const [, type, id] = match;
  if (type === "day") {
    const result = day(value, true);
    if (date(id) !== result.date)
      return invalid("De datum van het concept komt niet overeen.");
    return result;
  }
  if (id !== "new") identifier(id);
  const result = type === "moment" ? moment(value, true) : craving(value, true);
  if (id !== "new" && result.id !== id)
    return invalid("De identificatie van het concept komt niet overeen.");
  return result;
}

function decodeDrafts(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  if (raw.length > MAX_DRAFT_LENGTH)
    return invalid("Er zijn te veel conceptgegevens.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid("De opgeslagen concepten zijn niet leesbaar.");
  }
  const envelope = fields(parsed, ["version", "records"], "Concepten");
  if (envelope.version !== 1)
    return invalid("Deze versie van de concepten wordt niet ondersteund.");
  const records = object(envelope.records, "Concepten");
  if (Object.keys(records).length > 100)
    return invalid("Er zijn te veel opgeslagen concepten.");
  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => [
      key,
      draftValue(key, value),
    ]),
  );
}

export function loadDrafts(): Record<string, unknown> {
  let records: Record<string, unknown> = {};
  try {
    records = decodeDrafts(storage().getItem(DRAFT_STORAGE_KEY));
  } catch {
    /* Keep raw invalid bytes untouched and retain this session's input. */
  }
  for (const [key, value] of pendingDrafts)
    records[key] = draftValue(key, value);
  return records;
}

export function hasUnpersistedDrafts(): boolean {
  return pendingDrafts.size > 0 || pendingDraftRemovals.size > 0;
}

export function draftStorageWarning(): string | null {
  try {
    decodeDrafts(storage().getItem(DRAFT_STORAGE_KEY));
    return null;
  } catch {
    return "De opgeslagen concepten kunnen niet veilig worden gelezen. De oorspronkelijke gegevens zijn bewaard. Download eerst een herstelbestand voordat je de conceptopslag wist.";
  }
}

/** This preserves original bytes for manual recovery; it is not a data backup. */
export function exportDraftRecovery(): string {
  const raw = storage().getItem(DRAFT_STORAGE_KEY);
  return JSON.stringify(
    {
      format: "anchor.app.draft-recovery",
      version: 1,
      exportedAt: new Date().toISOString(),
      raw,
      pendingRecords: Object.fromEntries(pendingDrafts),
      pendingRemovals: [...pendingDraftRemovals],
    },
    null,
    2,
  );
}

/** The UI obtains explicit confirmation after offering the recovery download. */
export function clearDraftStorage(expectedRaw: string | null): WriteResult {
  try {
    const current = storage().getItem(DRAFT_STORAGE_KEY);
    if (current !== expectedRaw)
      return {
        ok: false,
        message:
          "Je concepten zijn intussen gewijzigd. Open het herstelvenster opnieuw en download een nieuw herstelbestand.",
      };
    storage().setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ version: 1, records: {} }),
    );
    pendingDrafts.clear();
    pendingDraftRemovals.clear();
    return { ok: true, message: null };
  } catch {
    return {
      ok: false,
      message:
        "De conceptopslag kon niet worden gewist. De bestaande gegevens en je niet-opgeslagen invoer zijn behouden.",
    };
  } finally {
    announceDraftStatus();
  }
}

function announceDraftStatus(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("anchor-draft-status", {
        detail: { unpersisted: hasUnpersistedDrafts() },
      }),
    );
}

export function saveDraft(key: string, value: unknown | null): WriteResult {
  try {
    // Validate the key even for removal, without permitting arbitrary keys.
    if (
      !/^(plan|goal|growth)$/.test(key) &&
      !/^(moment|craving):(new|[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127})$/.test(key) &&
      !/^day:\d{4}-\d{2}-\d{2}$/.test(key)
    )
      return invalid("Dit concept heeft een onbekende naam.");
    if (key.startsWith("day:")) date(key.slice(4));
    const parsed = value === null ? null : draftValue(key, value);
    if (parsed === null) pendingDraftRemovals.add(key);
    else {
      pendingDraftRemovals.delete(key);
      pendingDrafts.set(key, parsed);
    }
    const records = decodeDrafts(storage().getItem(DRAFT_STORAGE_KEY));
    for (const [pendingKey, pendingValue] of pendingDrafts)
      records[pendingKey] = pendingValue;
    for (const removedKey of pendingDraftRemovals) delete records[removedKey];
    if (Object.keys(records).length > 100)
      return invalid("Er zijn te veel opgeslagen concepten.");
    const raw = JSON.stringify({ version: 1, records });
    if (raw.length > MAX_DRAFT_LENGTH)
      return invalid("Er is te veel concepttekst om op te slaan.");
    storage().setItem(DRAFT_STORAGE_KEY, raw);
    pendingDrafts.clear();
    pendingDraftRemovals.clear();
    return { ok: true, message: null };
  } catch (error) {
    return {
      ok: false,
      message: `Concept niet opgeslagen. ${message(error, "De lokale opslag is niet beschikbaar.")} Je invoer blijft in beeld.`,
    };
  } finally {
    announceDraftStatus();
  }
}
