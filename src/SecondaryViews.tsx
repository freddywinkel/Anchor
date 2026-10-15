import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  AppState,
  CravingRecord,
  Day,
  EmotionRating,
  Goal,
  Moment,
  Ratings,
} from "./lib/storage";
import { loadDrafts, saveDraft } from "./lib/storage";
import type { Palette } from "./lib/palettes";
import { cravingSubstances, SUBSTANCE_OPTIONS } from "./lib/substances";
import { WeekOverview, type WeekRecordTarget } from "./WeekOverview";
import { MOODS } from "./RatingsEditor";
import { Dialog } from "./Dialog";
import { MoodPlot } from "./MoodPlot";
import { CravingUseAction } from "./CravingUseAction";
import { LinkedCravingCheckin } from "./CravingCheckins";
import { cravingUseConfirmation } from "./lib/cravingUse";
import "./history.css";
import "./secondary.css";

const palettes: { id: Palette; name: string; description: string }[] = [
  { id: "amber", name: "Amber", description: "Warm zand en goud" },
  { id: "sage", name: "Salie", description: "Zacht groen en mos" },
  { id: "ocean", name: "Oceaan", description: "Diep blauw en zeegroen" },
  { id: "rose", name: "Roos", description: "Roze klei en bessen" },
  { id: "lavender", name: "Lavendel", description: "Lila en nachtviolet" },
];

type Save = (next: AppState, message: string) => boolean;
const targetNames: Record<string, string> = {
  ...Object.fromEntries(SUBSTANCE_OPTIONS.map((name) => [name, name])),
  "Other substance": "Ander middel",
  Other: "Ander gedrag",
};
const goalDirections = ["Minderen", "Stoppen", "Gecontroleerd gebruik"];
function targetLabel(target: string) {
  return Object.hasOwn(targetNames, target) ? targetNames[target] : target;
}
function isStandardTarget(target: string) {
  return (
    Object.hasOwn(targetNames, target) &&
    target !== "Other substance" &&
    target !== "Other"
  );
}
function hasCustomName(goal: Goal | null) {
  return (
    !!goal && (!isStandardTarget(goal.target) || goal.name !== goal.target)
  );
}
function dateLabel(value: string, includeYear = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    ...(includeYear || year !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
  }).format(new Date(year, month - 1, day, 12));
}
function recentStart(currentDate: string) {
  const [year, month, day] = currentDate.split("-").map(Number);
  const date = new Date(year, month - 1, day - 6, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function moodLabel(value: number | null) {
  return value === null
    ? "niet ingevuld"
    : `${MOODS[value + 2]} (${value > 0 ? "+" : ""}${value})`;
}
function ratingsSearchText(ratings: Ratings | null) {
  return `${ratings?.emotionRatings?.map((emotion) => emotion.label).join(" ") || ""} ${ratings?.pans != null ? `pannetjes ${ratings.pans}/5` : ""}`;
}
function momentSearchText(moment: Moment) {
  return `${moment.note} ${moment.activity} ${moment.emotions.join(" ")} ${ratingsSearchText(moment.before)} ${ratingsSearchText(moment.after)} check-in ${moment.cravingId ? "gekoppelde craving terugblik" : ""}`.toLocaleLowerCase(
    "nl-NL",
  );
}
function intensityLabel(value: number | null | undefined) {
  return value === null || value === undefined
    ? "niet ingevuld"
    : `${value}/100`;
}
function HistoryRatings({
  before,
  after,
}: {
  before: Ratings;
  after?: Ratings | null;
}) {
  const rows: {
    key: string;
    before?: EmotionRating;
    after?: EmotionRating;
  }[] = (before.emotionRatings || []).map((emotion) => ({
    key: `before-${emotion.id}`,
    before: emotion,
  }));
  for (const emotion of after?.emotionRatings || []) {
    // A changed label is a different observation, even if an old draft kept
    // the same id. Do not suggest that two different emotions were compared.
    const matching = rows.find(
      (row) =>
        row.before?.id === emotion.id &&
        row.before.label.toLocaleLowerCase("nl-NL") ===
          emotion.label.toLocaleLowerCase("nl-NL"),
    );
    if (matching) matching.after = emotion;
    else rows.push({ key: `after-${emotion.id}`, after: emotion });
  }
  const hasLegacyIntensity =
    before.eis !== null ||
    (after !== null && after !== undefined && after.eis !== null);
  const hasPans = before.pans != null || after?.pans != null;
  if (!rows.length && !hasLegacyIntensity && !hasPans) return null;
  const values = (
    first: number | null | undefined,
    second: number | null | undefined,
  ) =>
    after
      ? `Vóór: ${intensityLabel(first)} · Na: ${intensityLabel(second)}`
      : intensityLabel(first);
  return (
    <div role="group" aria-label="Gevoel en intensiteit">
      {hasPans && (
        <p className="dp-entry-note">
          <strong>Pannetjes</strong>
          <br />
          <span>
            {after
              ? `Vóór: ${before.pans == null ? "niet ingevuld" : `${before.pans}/5`} · Na: ${after.pans == null ? "niet ingevuld" : `${after.pans}/5`}`
              : `${before.pans}/5`}
          </span>
        </p>
      )}
      {rows.map((row) => (
        <p className="dp-entry-note" key={row.key}>
          <strong>{row.before?.label ?? row.after?.label}</strong>
          <br />
          <span>{values(row.before?.intensity, row.after?.intensity)}</span>
        </p>
      ))}
      {hasLegacyIntensity && (
        <p className="dp-entry-note">
          <strong>Intensiteit — emotie niet gekoppeld</strong>
          <br />
          <span>{values(before.eis, after?.eis)}</span>
        </p>
      )}
    </div>
  );
}
function goalLabel(goal: Goal) {
  return goal.name.trim() || targetLabel(goal.target);
}

type HistoryEntry =
  | { type: "moment"; item: Moment; date: string; time: string }
  | { type: "craving"; item: CravingRecord; date: string; time: string }
  | { type: "day"; item: Day; date: string; time: string };
export type HistorySession = {
  period: "all" | "week";
  kind: "all" | "checkin" | "craving" | "day";
  query: string;
  expanded: string[];
  visible: Record<HistoryEntry["type"], number>;
  scrollY: number;
  returnRecord: string | null;
};
export const createHistorySession = (): HistorySession => ({
  period: "all",
  kind: "all",
  query: "",
  expanded: [],
  visible: { moment: 50, craving: 50, day: 50 },
  scrollY: 0,
  returnRecord: null,
});
const historyKey = (entry: HistoryEntry) =>
  `${entry.type}:${entry.type === "day" ? entry.date : entry.item.id}`;
const historyElementId = (key: string) => `anchor-history-record-${key}`;
const historyGroupNames = {
  moment: "Check-ins",
  craving: "Cravings",
  day: "Dagoverzichten",
};
function HistoryFields({
  fields,
  craving = false,
}: {
  fields: readonly (readonly [string, string | undefined])[];
  craving?: boolean;
}) {
  return (
    <dl
      className={
        craving ? "dp-history-fields dp-craving-summary" : "dp-history-fields"
      }
    >
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value?.trim() ? value : "Niet ingevuld"}</dd>
        </div>
      ))}
    </dl>
  );
}
function HistoryRecord({
  entry,
  state,
  onEdit,
  open,
  onToggle,
  onCravingUseChange,
  readOnly,
}: {
  entry: HistoryEntry;
  state: AppState;
  onEdit: () => void;
  open: boolean;
  onToggle: (open: boolean) => void;
  onCravingUseChange: (id: string, used: boolean) => boolean;
  readOnly: boolean;
}) {
  const substances =
    entry.type === "craving"
      ? cravingSubstances(entry.item).filter((name) => name.trim())
      : [];
  const useConfirmation =
    entry.type === "craving" ? cravingUseConfirmation(entry.item) : null;
  const substanceLabel =
    substances.length > 1 ? "Middelen of gedrag" : "Middel of gedrag";
  const typeLabel =
    entry.type === "day"
      ? "Dagoverzicht"
      : entry.type === "craving"
        ? "Craving / drang"
        : "Check-in";
  const afterLabel =
    entry.type === "moment" && entry.item.after
      ? `${entry.item.afterDate ? dateLabel(entry.item.afterDate, true) : "Datum niet ingevuld"} · ${entry.item.afterTime || "Tijd niet ingevuld"}`
      : "Niet ingevuld";
  return (
    <details
      id={historyElementId(historyKey(entry))}
      className="dp-history-record"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open)
          onToggle(event.currentTarget.open);
      }}
    >
      <summary className="dp-history-summary">
        <span className="dp-history-summary-text">
          <strong className="dp-history-type">{typeLabel}</strong>
          <span className="dp-history-date">
            <time dateTime={entry.date}>{dateLabel(entry.date, true)}</time>
            {entry.type !== "day" && (
              <time dateTime={`${entry.date}T${entry.time}`}>{entry.time}</time>
            )}
          </span>
          {entry.type === "craving" && (
            <>
              <span className="dp-history-preview">
                {substanceLabel}: {substances.join(", ") || "Niet ingevuld"}
              </span>
              {entry.item.usedAfterCraving === true && (
                <>
                  <span className="dp-craving-use-badge">Gebruikt</span>
                  <span className="dp-history-preview">
                    {useConfirmation?.confirmedAtLabel}
                  </span>
                  {useConfirmation?.elapsedLabel && (
                    <span className="dp-history-preview">
                      {useConfirmation.elapsedLabel}
                    </span>
                  )}
                </>
              )}
            </>
          )}
          {entry.type === "moment" && (
            <>
              {entry.item.cravingId && (
                <span className="dp-history-preview">
                  Gekoppeld aan een craving
                </span>
              )}
              {entry.item.activity && (
                <span className="dp-history-preview">
                  Activiteit: {entry.item.activity}
                </span>
              )}
              {(entry.item.activity || entry.item.after) && (
                <span className="dp-history-preview">
                  {entry.item.after
                    ? entry.item.afterDate !== entry.item.date
                      ? `Nameting: ${afterLabel}`
                      : "Nameting bewaard"
                    : "Nameting niet ingevuld"}
                </span>
              )}
            </>
          )}
        </span>
        <ChevronDown
          size={22}
          className="dp-history-chevron"
          aria-hidden="true"
        />
      </summary>
      {open && (
        <div className="dp-history-body dp-history-entry">
          {entry.type === "craving" ? (
            <HistoryFields
              craving
              fields={[
                [substanceLabel, substances.join("\n")],
                ["Externe situatie (wie, wat en waar)", entry.item.situation],
                ["Gedachte", entry.item.thought],
                ["Lichamelijke sensatie", entry.item.bodySensation],
                ["Emotie", entry.item.emotion],
                ["Gedrag", entry.item.behavior],
                ...(entry.item.usedAfterCraving === true
                  ? [["Gebruik na craving", "Gebruikt"] as const]
                  : []),
              ]}
            />
          ) : entry.type === "moment" ? (
            <>
              <HistoryFields
                fields={[
                  [
                    "Datum en tijd",
                    `${dateLabel(entry.date, true)} · ${entry.time}`,
                  ],
                  ["Stemming bij check-in", moodLabel(entry.item.before.mood)],
                  ["Nameting", afterLabel],
                  ...(entry.item.after
                    ? [
                        [
                          "Stemming bij nameting",
                          moodLabel(entry.item.after.mood),
                        ] as const,
                      ]
                    : []),
                ]}
              />
              <HistoryRatings
                before={entry.item.before}
                after={entry.item.after}
              />
              <HistoryFields
                fields={[
                  ["Activiteit", entry.item.activity],
                  [
                    "Activiteit geprobeerd",
                    entry.item.attempted === true
                      ? "Ja"
                      : entry.item.attempted === false
                        ? "Nee"
                        : "Niet ingevuld",
                  ],
                  ...(entry.item.emotions.length
                    ? [
                        [
                          "Emoties zonder gekoppelde score",
                          entry.item.emotions.join(", "),
                        ] as const,
                      ]
                    : []),
                  ["Notitie", entry.item.note],
                ]}
              />
            </>
          ) : (
            <>
              <HistoryFields
                fields={[
                  ["Datum", dateLabel(entry.date, true)],
                  ["Stemming", moodLabel(entry.item.ratings.mood)],
                ]}
              />
              <HistoryRatings before={entry.item.ratings} />
              <HistoryFields
                fields={[
                  [
                    "Slaap: uren",
                    entry.item.sleepHours === ""
                      ? "Niet ingevuld"
                      : `${entry.item.sleepHours} uur`,
                  ],
                  [
                    "Slaap: minuten",
                    entry.item.sleepMinutes === ""
                      ? "Niet ingevuld"
                      : `${entry.item.sleepMinutes} minuten`,
                  ],
                  ["Notitie", entry.item.note],
                ]}
              />
            </>
          )}
          {entry.type === "craving" && (
            <>
              <CravingUseAction
                record={entry.item}
                onChange={onCravingUseChange}
                disabled={readOnly}
              />
              {state.moments.some(
                (moment) => moment.cravingId === entry.item.id,
              ) && (
                <section
                  aria-label="Gekoppelde check-ins"
                  className="dp-linked-history"
                >
                  <h3>Gekoppelde check-ins</h3>
                  {state.moments
                    .filter((moment) => moment.cravingId === entry.item.id)
                    .map((moment) => (
                      <LinkedCravingCheckin key={moment.id} moment={moment} />
                    ))}
                </section>
              )}
            </>
          )}
          {entry.type === "moment" && entry.item.cravingId && (
            <HistoryFields
              fields={[
                [
                  "Gekoppelde craving",
                  (() => {
                    const craving = state.cravings.find(
                      (item) => item.id === entry.item.cravingId,
                    );
                    return craving
                      ? `${dateLabel(craving.date, true)} · ${craving.time}${cravingSubstances(craving).length ? ` · ${cravingSubstances(craving).join(", ")}` : ""}`
                      : "De gekoppelde craving is niet meer beschikbaar. Deze check-in blijft bewaard.";
                  })(),
                ],
              ]}
            />
          )}
          <button
            type="button"
            className="dp-button quiet"
            onClick={onEdit}
            aria-label={`Bewerken: ${entry.type === "day" ? "hele dag" : entry.type === "craving" ? "craving" : "check-in"} van ${dateLabel(entry.date, true)}${entry.type !== "day" ? ` om ${entry.time}` : ""}`}
          >
            <Pencil size={17} aria-hidden="true" /> Bewerken
          </button>
        </div>
      )}
    </details>
  );
}
function HistoryGroup({
  type,
  state,
  entries,
  session,
  onSessionChange,
  onEdit,
  onCravingUseChange,
  readOnly,
}: {
  type: HistoryEntry["type"];
  state: AppState;
  entries: HistoryEntry[];
  session: HistorySession;
  onSessionChange: Dispatch<SetStateAction<HistorySession>>;
  onEdit: (entry: HistoryEntry) => void;
  onCravingUseChange: (id: string, used: boolean) => boolean;
  readOnly: boolean;
}) {
  const visibleCount = session.visible[type];
  const listRef = useRef<HTMLOListElement>(null);
  const visibleEntries = entries.slice(0, visibleCount);
  const headingId = `anchor-history-${type}-heading`;
  const listId = `anchor-history-${type}-records`;
  return (
    <section
      className="dp-history-group"
      data-history-kind={type}
      aria-labelledby={headingId}
    >
      <div className="dp-section-head">
        <h3 id={headingId}>{historyGroupNames[type]}</h3>
        <span className="dp-count">
          {entries.length}{" "}
          {entries.length === 1 ? "registratie" : "registraties"}
        </span>
      </div>
      {entries.length ? (
        <ol className="dp-history-list" id={listId} ref={listRef}>
          {visibleEntries.map((entry) => {
            const id =
              entry.type === "day" ? `day-${entry.date}` : entry.item.id;
            return (
              <li key={id} data-history-id={id}>
                <HistoryRecord
                  entry={entry}
                  state={state}
                  open={session.expanded.includes(historyKey(entry))}
                  onToggle={(open) =>
                    onSessionChange((current) => ({
                      ...current,
                      expanded: open
                        ? [...new Set([...current.expanded, historyKey(entry)])]
                        : current.expanded.filter(
                            (key) => key !== historyKey(entry),
                          ),
                    }))
                  }
                  onEdit={() => onEdit(entry)}
                  onCravingUseChange={onCravingUseChange}
                  readOnly={readOnly}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dp-muted">
          Geen {historyGroupNames[type].toLocaleLowerCase("nl-NL")} binnen deze
          selectie.
        </p>
      )}
      {entries.length > 50 && (
        <div className="dp-history-pagination">
          <p className="dp-muted" role="status">
            Je ziet {visibleEntries.length} van {entries.length}{" "}
            {historyGroupNames[type].toLocaleLowerCase("nl-NL")}.
          </p>
          {visibleCount < entries.length && (
            <button
              className="dp-button"
              type="button"
              aria-controls={listId}
              onClick={() => {
                const firstAdded = visibleEntries.length;
                onSessionChange((current) => ({
                  ...current,
                  visible: { ...current.visible, [type]: visibleCount + 50 },
                }));
                requestAnimationFrame(() =>
                  listRef.current
                    ?.querySelectorAll<HTMLElement>("li > details > summary")
                    [firstAdded]?.focus(),
                );
              }}
            >
              Meer {historyGroupNames[type].toLocaleLowerCase("nl-NL")} tonen
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function HistoryView({
  state,
  currentDate,
  session,
  onSessionChange,
  onOpenMoment,
  onOpenDay,
  onOpenCraving,
  onCravingUseChange,
  readOnly,
}: {
  state: AppState;
  currentDate: string;
  session: HistorySession;
  onSessionChange: Dispatch<SetStateAction<HistorySession>>;
  onOpenMoment: (id: string) => void;
  onOpenDay: (date: string) => void;
  onOpenCraving: (id: string) => void;
  onCravingUseChange: (id: string, used: boolean) => boolean;
  readOnly: boolean;
}) {
  const { period, kind, query } = session;
  const [reveal, setReveal] = useState<WeekRecordTarget | null>(null);
  const [searchDraft, setSearchDraft] = useState<Pick<
    HistorySession,
    "period" | "kind" | "query"
  > | null>(null);
  const activeFilters =
    Number(period !== "all") +
    Number(kind !== "all") +
    Number(Boolean(query.trim()));
  const returnPosition = useRef({
    scrollY: session.scrollY,
    record: session.returnRecord,
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const { scrollY, record } = returnPosition.current;
      if (record) {
        const summary = document
          .getElementById(historyElementId(record))
          ?.querySelector<HTMLElement>("summary");
        if (summary) {
          summary.focus({ preventScroll: true });
          window.scrollTo({ top: scrollY, behavior: "instant" });
        } else {
          // Deletion or an edit can remove this card from the current selection.
          // Keep the user's filters, but never restore focus above the viewport.
          const heading = document.getElementById("dp-history-entries");
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({ block: "start", behavior: "instant" });
          onSessionChange((current) => ({
            ...current,
            returnRecord: null,
            scrollY: 0,
          }));
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const changeFilter = (
    patch: Partial<Pick<HistorySession, "period" | "kind" | "query">>,
  ) =>
    onSessionChange((current) => ({
      ...current,
      ...patch,
      visible: { moment: 50, craving: 50, day: 50 },
      scrollY: 0,
      returnRecord: null,
    }));
  const entries = useMemo<HistoryEntry[]>(() => {
    const start = recentStart(currentDate);
    const withinPeriod = (date: string) =>
      period === "all" || (date >= start && date <= currentDate);
    const search = query.trim().toLocaleLowerCase("nl-NL");
    const moments = state.moments
      .filter(
        (item) =>
          (withinPeriod(item.date) ||
            (item.after !== null &&
              item.afterDate !== null &&
              withinPeriod(item.afterDate))) &&
          (kind === "all" || item.kind === kind) &&
          momentSearchText(item).includes(search),
      )
      .map((item) => ({
        type: "moment" as const,
        item,
        date: item.date,
        time: item.time,
      }));
    const days = state.days
      .filter(
        (item) =>
          (period === "all" ||
            (item.date >= start && item.date <= currentDate)) &&
          (kind === "all" || kind === "day") &&
          `${item.note} ${ratingsSearchText(item.ratings)} mijn hele dag dagsamenvatting`
            .toLocaleLowerCase("nl-NL")
            .includes(search),
      )
      .map((item) => ({
        type: "day" as const,
        item,
        date: item.date,
        time: "",
      }));
    const cravings = state.cravings
      .filter(
        (item) =>
          (period === "all" ||
            (item.date >= start && item.date <= currentDate)) &&
          (kind === "all" || kind === "craving") &&
          `${cravingSubstances(item).join(" ")} ${item.situation} ${item.thought} ${item.bodySensation} ${item.emotion} ${item.behavior} craving drang ${item.usedAfterCraving === true ? "gebruik na craving gebruikt" : ""}`
            .toLocaleLowerCase("nl-NL")
            .includes(search),
      )
      .map((item) => ({
        type: "craving" as const,
        item,
        date: item.date,
        time: item.time,
      }));
    return [...moments, ...days, ...cravings].sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
    );
  }, [
    state.moments,
    state.days,
    state.cravings,
    period,
    kind,
    query,
    currentDate,
  ]);
  useEffect(() => {
    if (!reveal) return;
    const key = `${reveal.type}:${reveal.id}`;
    const group = entries.filter((entry) => entry.type === reveal.type);
    const index = group.findIndex((entry) => historyKey(entry) === key);
    if (index < 0) {
      setReveal(null);
      return;
    }
    if (index >= session.visible[reveal.type]) {
      onSessionChange((current) => ({
        ...current,
        visible: {
          ...current.visible,
          [reveal.type]: Math.ceil((index + 1) / 50) * 50,
        },
      }));
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = document
        .getElementById(historyElementId(key))
        ?.querySelector<HTMLElement>("summary");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start", behavior: "instant" });
      setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, entries, session.visible, onSessionChange]);
  const observations = state.moments
    .filter(
      (item) =>
        (kind === "all" || kind === "checkin") &&
        momentSearchText(item).includes(
          query.trim().toLocaleLowerCase("nl-NL"),
        ),
    )
    .flatMap((m) => {
      return [
        ...(m.before.mood !== null
          ? [
              {
                id: `${m.id}-before`,
                date: m.date,
                time: m.time,
                mood: m.before.mood,
                label: "Check-in",
              },
            ]
          : []),
        ...(m.after?.mood !== null && m.after?.mood !== undefined
          ? [
              {
                id: `${m.id}-after`,
                date: m.afterDate || m.date,
                time: m.afterTime || m.time,
                mood: m.after.mood,
                label: "Nameting",
              },
            ]
          : []),
      ];
    })
    .filter(
      (point) =>
        period === "all" ||
        (point.date >= recentStart(currentDate) && point.date <= currentDate),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const hasRecords =
    state.moments.length + state.cravings.length + state.days.length > 0;
  return (
    <div className="dp-history">
      <header className="dp-page-title dp-history-title">
        <div>
          <p className="dp-kicker">Jouw aantekeningen</p>
          <h1 tabIndex={-1}>Terugkijken</h1>
          <p className="dp-lead">
            Klap een registratie open om alles terug te lezen.
          </p>
        </div>
        <button
          type="button"
          className="dp-button dp-history-search-trigger"
          aria-label="Zoeken en filteren"
          aria-haspopup="dialog"
          aria-describedby="dp-history-selection"
          onClick={(event) => {
            // Safari does not focus a button on pointer activation. Capture a
            // reliable opener so cancelling returns to this search control.
            event.currentTarget.focus({ preventScroll: true });
            setSearchDraft({ period, kind, query });
          }}
        >
          <Search size={22} aria-hidden="true" />
          {activeFilters > 0 && (
            <span className="dp-search-badge" aria-hidden="true">
              {activeFilters}
            </span>
          )}
        </button>
      </header>
      <div className="dp-history-selection">
        <p id="dp-history-selection">
          <strong className="dp-history-filter-label">Filter:</strong>
          <span>{period === "week" ? "Afgelopen 7 dagen" : "Alle dagen"}</span>
          <span>
            {
              {
                all: "Alle soorten",
                checkin: "Check-ins",
                craving: "Cravings",
                day: "Dagoverzichten",
              }[kind]
            }
          </span>
          {query.trim() && <span>Zoekterm: ‘{query.trim()}’</span>}
        </p>
        {activeFilters > 0 && (
          <button
            type="button"
            className="dp-button quiet"
            onClick={() =>
              changeFilter({ period: "all", kind: "all", query: "" })
            }
          >
            Filters wissen
          </button>
        )}
      </div>
      {searchDraft && (
        <Dialog
          title="Zoeken in registraties"
          onClose={() => setSearchDraft(null)}
        >
          <form
            className="dp-history-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              changeFilter({ ...searchDraft, query: searchDraft.query.trim() });
              setSearchDraft(null);
            }}
          >
            <p className="dp-muted">
              Kies wat je wilt teruglezen. Je registraties blijven bewaard.
            </p>
            <label className="dp-field">
              Zoeken
              <input
                type="search"
                placeholder="Middel, situatie, emotie of activiteit"
                value={searchDraft.query}
                onChange={(event) =>
                  setSearchDraft({ ...searchDraft, query: event.target.value })
                }
              />
            </label>
            <label className="dp-field">
              Periode
              <select
                value={searchDraft.period}
                onChange={(event) =>
                  setSearchDraft({
                    ...searchDraft,
                    period: event.target.value as HistorySession["period"],
                  })
                }
              >
                <option value="week">7 dagen</option>
                <option value="all">Alle dagen</option>
              </select>
            </label>
            <label className="dp-field">
              Soort registratie
              <select
                value={searchDraft.kind}
                onChange={(event) =>
                  setSearchDraft({
                    ...searchDraft,
                    kind: event.target.value as HistorySession["kind"],
                  })
                }
              >
                <option value="all">Alles</option>
                <option value="checkin">Check-ins</option>
                <option value="craving">Cravings</option>
                <option value="day">Hele dag</option>
              </select>
            </label>
            <div className="dp-actions dp-history-search-actions">
              <button type="submit" className="dp-button primary">
                Resultaten tonen
              </button>
              <button
                type="button"
                className="dp-button"
                onClick={() => setSearchDraft(null)}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="dp-button quiet"
                onClick={() =>
                  setSearchDraft({ period: "all", kind: "all", query: "" })
                }
              >
                Criteria wissen
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {period === "week" && (
        <WeekOverview
          state={state}
          currentDate={currentDate}
          onOpenRecord={(target) => {
            onSessionChange((current) => ({
              ...current,
              kind: "all",
              query: "",
              expanded: [
                ...new Set([
                  ...current.expanded,
                  `${target.type}:${target.id}`,
                ]),
              ],
              returnRecord: null,
            }));
            setReveal(target);
          }}
        />
      )}
      {hasRecords && (kind === "all" || kind === "checkin") && (
        <MoodPlot observations={observations} />
      )}
      <section
        className="dp-records-section"
        aria-labelledby="dp-history-entries"
      >
        <div className="dp-section-head dp-records-header">
          <div>
            <p className="dp-kicker">Je bewaarde momenten</p>
            <h2 id="dp-history-entries" tabIndex={-1}>
              Registraties
            </h2>
            <p className="dp-muted">
              Check-ins, cravings en dagoverzichten, elk in hun eigen groep.
            </p>
          </div>
          <p className="dp-muted" role="status">
            {entries.length} gevonden
          </p>
        </div>
        {!entries.length && (
          <div className="dp-empty-inline">
            <h3>
              {hasRecords
                ? "Geen registraties gevonden"
                : "Je hebt nog geen registraties"}
            </h3>
            <p>
              {hasRecords
                ? "Probeer een andere periode of verwijder je zoekterm."
                : "Je eerste check-in, craving of dagoverzicht verschijnt hier zodra je iets bewaart."}
            </p>
            {hasRecords ? (
              <button
                className="dp-button quiet"
                onClick={() => {
                  changeFilter({ period: "all", kind: "all", query: "" });
                }}
              >
                Alle registraties tonen
              </button>
            ) : (
              <a className="dp-button quiet" href="#/today">
                Naar Vandaag
              </a>
            )}
          </div>
        )}
        {!!entries.length &&
          (["moment", "craving", "day"] as const)
            .filter(
              (type) =>
                kind === "all" ||
                kind === (type === "moment" ? "checkin" : type),
            )
            .map((type) => (
              <HistoryGroup
                key={type}
                type={type}
                state={state}
                entries={entries.filter((entry) => entry.type === type)}
                session={session}
                onSessionChange={onSessionChange}
                readOnly={readOnly}
                onCravingUseChange={(id, used) => {
                  if (!onCravingUseChange(id, used)) return false;
                  requestAnimationFrame(() => {
                    // Removing a mark can remove this card from search results.
                    if (
                      !document.getElementById(
                        historyElementId(`craving:${id}`),
                      )
                    ) {
                      const heading =
                        document.getElementById("dp-history-entries");
                      heading?.focus({ preventScroll: true });
                      heading?.scrollIntoView({
                        block: "start",
                        behavior: "instant",
                      });
                    }
                  });
                  return true;
                }}
                onEdit={(entry) => {
                  onSessionChange((current) => ({
                    ...current,
                    scrollY: window.scrollY,
                    returnRecord: historyKey(entry),
                  }));
                  entry.type === "day"
                    ? onOpenDay(entry.date)
                    : entry.type === "craving"
                      ? onOpenCraving(entry.item.id)
                      : onOpenMoment(entry.item.id);
                }}
              />
            ))}
      </section>
    </div>
  );
}

function DraftNotice({
  error,
  focusRef,
}: {
  error: string;
  focusRef?: React.RefObject<HTMLParagraphElement | null>;
}) {
  return error ? (
    <p className="dp-error" role="alert" tabIndex={-1} ref={focusRef}>
      {error} Houd dit scherm open tot je het opnieuw hebt geprobeerd.
    </p>
  ) : (
    <p className="dp-muted dp-draft-note">
      Je concept wordt op dit apparaat bewaard terwijl je typt.
    </p>
  );
}

export function PlanView({ state, onSave }: { state: AppState; onSave: Save }) {
  const [goal, setGoal] = useState<Goal | null>(
    () => (loadDrafts().goal as Goal | undefined) || null,
  );
  const [goalHasDraft, setGoalHasDraft] = useState(!!goal);
  const [goalCleanupPending, setGoalCleanupPending] = useState(false);
  const [customName, setCustomName] = useState(() => hasCustomName(goal));
  const [customDirection, setCustomDirection] = useState(
    () => !!goal?.direction && !goalDirections.includes(goal.direction),
  );
  const [goalError, setGoalError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [plan, setPlan] = useState<AppState["plan"]>(
    () => (loadDrafts().plan as AppState["plan"] | undefined) || state.plan,
  );
  const hasSavedPlan = Object.values(state.plan).some((text) => text.trim());
  const [planEditing, setPlanEditing] = useState(
    () => !!loadDrafts().plan || !hasSavedPlan,
  );
  const [planError, setPlanError] = useState("");
  const [planDraftError, setPlanDraftError] = useState("");
  const [planSaved, setPlanSaved] = useState(false);
  const [planCleanupPending, setPlanCleanupPending] = useState(false);
  const [discardingPlan, setDiscardingPlan] = useState(false);
  const goalName = useRef<HTMLInputElement>(null);
  const goalTarget = useRef<HTMLSelectElement>(null);
  const goalDirection = useRef<HTMLSelectElement>(null);
  const goalDescription = useRef<HTMLInputElement>(null);
  const planStart = useRef<HTMLTextAreaElement>(null);
  const planEditButton = useRef<HTMLButtonElement>(null);
  const planDirty = useRef(!!loadDrafts().plan);
  const addButton = useRef<HTMLButtonElement>(null);
  const goalFeedback = useRef<HTMLParagraphElement>(null);
  const planFeedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!planDirty.current) setPlan(state.plan);
  }, [state.plan]);
  useEffect(() => {
    if (goal) goalTarget.current?.focus();
  }, [goal?.id]);
  function updateGoal(next: Goal) {
    if (JSON.stringify(next) !== JSON.stringify(goal))
      setGoalCleanupPending(false);
    setGoal(next);
    setGoalError("");
    setGoalHasDraft(true);
    const result = saveDraft("goal", next);
    setDraftError(
      result.ok ? "" : result.message || "Je concept kon niet worden bewaard.",
    );
  }
  function openGoal(existing?: Goal) {
    if (goal) {
      goalTarget.current?.focus();
      return;
    }
    setCustomName(hasCustomName(existing || null));
    setCustomDirection(
      !!existing?.direction && !goalDirections.includes(existing.direction),
    );
    setGoalHasDraft(false);
    setGoalCleanupPending(false);
    setGoal(
      existing || {
        id: crypto.randomUUID(),
        target: "",
        name: "",
        direction: "",
        note: "",
      },
    );
    setGoalError("");
    setRemoving(null);
    setDiscarding(false);
  }
  function clearGoal(saved = false) {
    const result = goalHasDraft
      ? saveDraft("goal", null)
      : { ok: true, message: null };
    if (!result.ok) {
      setGoalCleanupPending(saved || goalCleanupPending);
      setDraftError(
        saved || goalCleanupPending
          ? "Je doel is opgeslagen, maar het concept kon niet worden opgeruimd. Probeer het afronden opnieuw."
          : result.message || "Het concept kon niet worden gewist.",
      );
      requestAnimationFrame(() => goalFeedback.current?.focus());
      return;
    }
    setGoal(null);
    setGoalHasDraft(false);
    setGoalCleanupPending(false);
    setDiscarding(false);
    setGoalError("");
    setDraftError("");
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    if (!goal) return;
    if (goalCleanupPending) {
      clearGoal(true);
      return;
    }
    if (!goal.target.trim() || !goal.name.trim() || !goal.direction.trim()) {
      setGoalError("Kies een middel of gedrag en vul je doel in.");
      if (!goal.target.trim()) goalTarget.current?.focus();
      else if (!goal.name.trim()) goalName.current?.focus();
      else if (customDirection) goalDescription.current?.focus();
      else goalDirection.current?.focus();
      return;
    }
    const existing = state.goals.find((item) => item.id === goal.id);
    const entry = {
      ...goal,
      id: goal.id === "new" ? crypto.randomUUID() : goal.id,
    };
    if (
      onSave(
        {
          ...state,
          goals: existing
            ? state.goals.map((item) => (item.id === entry.id ? entry : item))
            : [...state.goals, entry],
        },
        "Je doel is opgeslagen.",
      )
    ) {
      setGoal(entry);
      setGoalError("");
      setDiscarding(false);
      clearGoal(true);
    } else {
      setGoalError(
        "Opslaan is niet gelukt. Je wijzigingen blijven in het formulier staan.",
      );
      requestAnimationFrame(() => goalFeedback.current?.focus());
    }
  }
  function updatePlan(next: AppState["plan"]) {
    if (JSON.stringify(next) !== JSON.stringify(plan))
      setPlanCleanupPending(false);
    setPlan(next);
    setPlanError("");
    setPlanSaved(false);
    planDirty.current = true;
    const result = saveDraft("plan", next);
    setPlanDraftError(
      result.ok ? "" : result.message || "Je concept kon niet worden bewaard.",
    );
  }
  function finishPlanSave() {
    const result = saveDraft("plan", null);
    planDirty.current = !result.ok;
    setPlanCleanupPending(!result.ok);
    setPlanDraftError(
      result.ok
        ? ""
        : "Je plan is opgeslagen, maar het concept kon niet worden opgeruimd. Probeer het afronden opnieuw.",
    );
    if (!result.ok) requestAnimationFrame(() => planFeedback.current?.focus());
    else {
      setPlanEditing(false);
      requestAnimationFrame(() => planEditButton.current?.focus());
    }
  }
  function savePlan(event: React.FormEvent) {
    event.preventDefault();
    if (planCleanupPending) {
      finishPlanSave();
      return;
    }
    if (
      onSave(
        {
          ...state,
          plan: {
            warning: plan.warning.trim(),
            action: plan.action.trim(),
            support: plan.support.trim(),
          },
        },
        "Je persoonlijke plan is opgeslagen.",
      )
    ) {
      planDirty.current = false;
      setPlanError("");
      setPlanSaved(true);
      setDiscardingPlan(false);
      finishPlanSave();
    } else {
      setPlanError(
        "Opslaan is niet gelukt. Je tekst blijft hier staan; probeer opnieuw.",
      );
      requestAnimationFrame(() => planFeedback.current?.focus());
    }
  }
  return (
    <div className="dp-plan">
      <section aria-labelledby="dp-goals-title">
        <div className="dp-section-head">
          <h2 id="dp-goals-title">Mijn doelen</h2>
          <button
            ref={addButton}
            className="dp-button quiet"
            onClick={() => openGoal()}
          >
            <Plus size={17} aria-hidden="true" />
            {goal ? "Naar het formulier" : "Doel toevoegen"}
          </button>
        </div>
        {!state.goals.length && (
          <p className="dp-empty-inline">
            Je hoeft nog geen doel te hebben. Voeg er één toe wanneer het voor
            jou past.
          </p>
        )}
        <ul className="dp-goal-list">
          {state.goals.map((item) => (
            <li key={item.id}>
              <div>
                {targetLabel(item.target) !== goalLabel(item) && (
                  <p className="dp-kicker">{targetLabel(item.target)}</p>
                )}
                <h3>{goalLabel(item)}</h3>
                <p>{item.direction}</p>
                {item.note && (
                  <p className="dp-muted dp-preserve-lines">{item.note}</p>
                )}
              </div>
              <div className="dp-row-actions">
                <button
                  className="dp-button quiet"
                  disabled={!!goal}
                  onClick={() => openGoal(item)}
                  aria-label={`Bewerken: doel ${goalLabel(item)}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Bewerken
                </button>
                <button
                  className="dp-button quiet"
                  disabled={!!goal}
                  onClick={() => {
                    setRemoving(item.id);
                    setGoalError("");
                  }}
                  aria-label={`Verwijder doel ${goalLabel(item)}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  <span className="dp-visually-hidden">Verwijderen</span>
                </button>
              </div>
              {removing === item.id && (
                <div
                  className="dp-inline-confirm"
                  role="group"
                  aria-label={`Verwijderen van ${goalLabel(item)} bevestigen`}
                >
                  <p>
                    Doel ‘{goalLabel(item)}’ verwijderen? Je registraties
                    blijven bewaard.
                  </p>
                  <div className="dp-row-actions">
                    <button
                      className="dp-button"
                      onClick={() => {
                        if (
                          onSave(
                            {
                              ...state,
                              goals: state.goals.filter(
                                (entry) => entry.id !== item.id,
                              ),
                            },
                            "Het doel is verwijderd.",
                          )
                        ) {
                          setRemoving(null);
                          addButton.current?.focus();
                        } else {
                          setGoalError(
                            "Verwijderen is niet gelukt. Je doel staat nog in de lijst.",
                          );
                          requestAnimationFrame(() =>
                            goalFeedback.current?.focus(),
                          );
                        }
                      }}
                    >
                      Ja, doel verwijderen
                    </button>
                    <button
                      className="dp-button quiet"
                      onClick={() => setRemoving(null)}
                    >
                      Behouden
                    </button>
                  </div>
                  {goalError && (
                    <p
                      className="dp-error"
                      role="alert"
                      tabIndex={-1}
                      ref={goalFeedback}
                    >
                      {goalError}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {goal && (
          <form className="dp-goal-editor dp-panel dp-card" onSubmit={saveGoal}>
            <h3>
              {state.goals.some((item) => item.id === goal.id)
                ? "Doel bewerken"
                : "Nieuw doel"}
            </h3>
            <label className="dp-field">
              Middel of gedrag
              <select
                ref={goalTarget}
                value={goal.target}
                onChange={(event) => {
                  const target = event.target.value;
                  const standard = isStandardTarget(target);
                  setCustomName(!standard);
                  updateGoal({
                    ...goal,
                    target,
                    name: standard ? target : customName ? goal.name : "",
                  });
                }}
                required
              >
                <option value="" disabled>
                  Kies een middel of gedrag
                </option>
                {Object.entries(targetNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {goal.target && !Object.hasOwn(targetNames, goal.target) && (
                  <option value={goal.target}>{goal.target}</option>
                )}
              </select>
            </label>
            {goal.target && customName && (
              <label className="dp-field">
                Naam van middel of gedrag
                <input
                  ref={goalName}
                  value={goal.name}
                  maxLength={200}
                  onChange={(event) =>
                    updateGoal({ ...goal, name: event.target.value })
                  }
                  aria-invalid={!!goalError && !goal.name.trim()}
                  placeholder="Bijvoorbeeld ketamine of dagelijks wandelen"
                  required
                />
              </label>
            )}
            <label className="dp-field">
              Mijn doel
              <select
                ref={goalDirection}
                value={customDirection ? "__custom__" : goal.direction}
                onChange={(event) => {
                  const direction = event.target.value;
                  setCustomDirection(direction === "__custom__");
                  updateGoal({
                    ...goal,
                    direction:
                      direction === "__custom__" ? goal.direction : direction,
                  });
                }}
                required
              >
                <option value="" disabled>
                  Kies je doel
                </option>
                {goalDirections.map((direction) => (
                  <option key={direction} value={direction}>
                    {direction}
                  </option>
                ))}
                <option value="__custom__">Eigen doel</option>
              </select>
            </label>
            {customDirection && (
              <label className="dp-field">
                Omschrijf je doel
                <input
                  ref={goalDescription}
                  value={goal.direction}
                  maxLength={200}
                  onChange={(event) =>
                    updateGoal({ ...goal, direction: event.target.value })
                  }
                  placeholder="Bijvoorbeeld elke dag even naar buiten"
                  aria-invalid={!!goalError && !goal.direction.trim()}
                  required
                />
              </label>
            )}
            <label className="dp-field">
              Waarom dit bij mij past (optioneel)
              <textarea
                rows={3}
                maxLength={4000}
                value={goal.note}
                onChange={(event) =>
                  updateGoal({ ...goal, note: event.target.value })
                }
              />
            </label>
            {goalHasDraft && (
              <DraftNotice error={draftError} focusRef={goalFeedback} />
            )}
            {goalError && (
              <p
                className="dp-error"
                role="alert"
                tabIndex={-1}
                ref={goalFeedback}
              >
                {goalError}
              </p>
            )}
            <div className="dp-row-actions">
              <button className="dp-button primary" type="submit">
                <Check size={17} aria-hidden="true" />
                {goalCleanupPending
                  ? "Afronden opnieuw proberen"
                  : state.goals.some((item) => item.id === goal.id)
                    ? "Wijzigingen opslaan"
                    : "Doel opslaan"}
              </button>
              <button
                className="dp-button quiet"
                type="button"
                onClick={() => setDiscarding(true)}
              >
                {goalHasDraft ? "Concept wissen" : "Formulier sluiten"}
              </button>
            </div>
            {discarding && (
              <div
                className="dp-inline-confirm"
                role="group"
                aria-label={
                  goalHasDraft
                    ? "Concept van doel wissen"
                    : "Doelformulier sluiten"
                }
              >
                <p>
                  {goalHasDraft
                    ? "Je concept wissen en het formulier sluiten? Een eerder opgeslagen doel blijft bewaard."
                    : "Dit formulier sluiten? Een eerder opgeslagen doel blijft bewaard."}
                </p>
                <div className="dp-row-actions">
                  <button
                    type="button"
                    className="dp-button"
                    onClick={() => clearGoal()}
                  >
                    {goalHasDraft
                      ? "Ja, concept wissen"
                      : "Ja, formulier sluiten"}
                  </button>
                  <button
                    type="button"
                    className="dp-button quiet"
                    onClick={() => setDiscarding(false)}
                  >
                    Verder schrijven
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </section>
      {!planEditing ? (
        <section
          className="dp-personal-plan dp-card"
          aria-labelledby="dp-personal-plan-title"
        >
          <p className="dp-kicker">Mijn persoonlijke houvast</p>
          <h2 id="dp-personal-plan-title">Wat helpt als het lastig wordt?</h2>
          {planSaved && (
            <p className="dp-muted" role="status">
              Je plan is opgeslagen.
            </p>
          )}
          <dl className="dp-plan-text">
            {(
              [
                ["Dit merk ik bij mezelf", state.plan.warning],
                ["Dit kan ik doen", state.plan.action],
                ["Hier vind ik steun", state.plan.support],
              ] as const
            ).map(([label, text]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={text.trim() ? "" : "dp-muted"}>
                  {text.trim() ? text : "Nog niet ingevuld"}
                </dd>
              </div>
            ))}
          </dl>
          <button
            ref={planEditButton}
            type="button"
            className="dp-button quiet"
            onClick={() => {
              setPlan(state.plan);
              setPlanSaved(false);
              setPlanEditing(true);
              requestAnimationFrame(() => {
                if (
                  !document.activeElement?.matches(
                    "input, textarea, select, [contenteditable='true']",
                  )
                )
                  planStart.current?.focus();
              });
            }}
          >
            <Pencil size={17} aria-hidden="true" />{" "}
            <span className="dp-plan-edit-label">Mijn plan bewerken</span>
          </button>
        </section>
      ) : (
        <form
          className="dp-personal-plan dp-card"
          onSubmit={savePlan}
          aria-labelledby="dp-personal-plan-title"
        >
          <p className="dp-kicker">Mijn persoonlijke houvast</p>
          <h2 id="dp-personal-plan-title">Wat helpt als het lastig wordt?</h2>
          <p className="dp-muted">Vul alleen in wat voor jou bruikbaar is.</p>
          <label className="dp-field">
            Dit merk ik bij mezelf
            <textarea
              ref={planStart}
              rows={3}
              maxLength={4000}
              value={plan.warning}
              onChange={(event) =>
                updatePlan({ ...plan, warning: event.target.value })
              }
              placeholder="Bijvoorbeeld: ik trek me terug of slaap slechter."
            />
          </label>
          <label className="dp-field">
            Dit kan ik doen
            <textarea
              rows={3}
              maxLength={4000}
              value={plan.action}
              onChange={(event) =>
                updatePlan({ ...plan, action: event.target.value })
              }
              placeholder="Een kleine stap die mij helpt."
            />
          </label>
          <label className="dp-field">
            Hier vind ik steun
            <textarea
              rows={3}
              maxLength={4000}
              value={plan.support}
              onChange={(event) =>
                updatePlan({ ...plan, support: event.target.value })
              }
              placeholder="Iemand of een plek waar ik terecht kan."
            />
          </label>
          {planDirty.current && (
            <DraftNotice error={planDraftError} focusRef={planFeedback} />
          )}
          {planError && (
            <p
              className="dp-error"
              role="alert"
              tabIndex={-1}
              ref={planFeedback}
            >
              {planError}
            </p>
          )}
          {planSaved && !planDirty.current && (
            <p className="dp-muted" role="status">
              Je plan is opgeslagen.
            </p>
          )}
          <div className="dp-row-actions">
            <button
              className="dp-button primary"
              type="submit"
              disabled={!planDirty.current}
            >
              {planCleanupPending
                ? "Afronden opnieuw proberen"
                : "Mijn plan opslaan"}
            </button>
            {planDirty.current && (
              <button
                className="dp-button quiet"
                type="button"
                onClick={() => setDiscardingPlan(true)}
              >
                Concept wissen
              </button>
            )}
            {!planDirty.current && (hasSavedPlan || planSaved) && (
              <button
                className="dp-button quiet"
                type="button"
                onClick={() => {
                  setPlanEditing(false);
                  requestAnimationFrame(() => planEditButton.current?.focus());
                }}
              >
                Bewerken sluiten
              </button>
            )}
          </div>
          {discardingPlan && (
            <div
              className="dp-inline-confirm"
              role="group"
              aria-label="Concept van persoonlijk plan wissen"
            >
              <p>Je concept wissen en je opgeslagen plan terugzetten?</p>
              <div className="dp-row-actions">
                <button
                  type="button"
                  className="dp-button"
                  onClick={() => {
                    const result = saveDraft("plan", null);
                    if (!result.ok) {
                      setPlanDraftError(
                        result.message || "Je concept kon niet worden gewist.",
                      );
                      requestAnimationFrame(() =>
                        planFeedback.current?.focus(),
                      );
                      return;
                    }
                    planDirty.current = false;
                    setPlanCleanupPending(false);
                    setPlan(state.plan);
                    setPlanError("");
                    setPlanDraftError("");
                    setDiscardingPlan(false);
                    const keepEditing = !hasSavedPlan && !planSaved;
                    setPlanEditing(keepEditing);
                    requestAnimationFrame(() =>
                      keepEditing
                        ? planStart.current?.focus()
                        : planEditButton.current?.focus(),
                    );
                  }}
                >
                  Ja, concept wissen
                </button>
                <button
                  type="button"
                  className="dp-button quiet"
                  onClick={() => setDiscardingPlan(false)}
                >
                  Verder schrijven
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export function GrowthView({
  state,
  currentDate,
  onSave,
}: {
  state: AppState;
  currentDate: string;
  onSave: Save;
}) {
  type Growth = AppState["growth"][number];
  const empty = (): Growth => ({
    id: crypto.randomUUID(),
    date: currentDate,
    text: "",
    favorite: false,
  });
  const [entry, setEntry] = useState<Growth>(
    () => (loadDrafts().growth as Growth | undefined) || empty(),
  );
  const [error, setError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [actionError, setActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [dateError, setDateError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [hasDraft, setHasDraft] = useState(!!loadDrafts().growth);
  const previousDate = useRef(currentDate);
  useEffect(() => {
    const previous = previousDate.current;
    previousDate.current = currentDate;
    if (previous === currentDate) return;
    if (
      !hasDraft &&
      !entry.text &&
      !entry.favorite &&
      entry.date === previous &&
      !state.growth.some((item) => item.id === entry.id)
    ) {
      setEntry((current) => ({ ...current, date: currentDate }));
    }
  }, [currentDate]);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const growthList = useRef<HTMLUListElement>(null);
  const sortedGrowth = useMemo(
    () => [...state.growth].sort((a, b) => b.date.localeCompare(a.date)),
    [state.growth],
  );
  const textField = useRef<HTMLTextAreaElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const actionErrorField = useRef<HTMLParagraphElement>(null);
  const saveFeedback = useRef<HTMLParagraphElement>(null);
  const showActionError = (id: string, message: string) => {
    setActionError({ id, message });
    requestAnimationFrame(() => actionErrorField.current?.focus());
  };
  const update = (next: Growth) => {
    if (JSON.stringify(next) !== JSON.stringify(entry))
      setCleanupPending(false);
    setEntry(next);
    setError("");
    const saved = state.growth.find((item) => item.id === next.id);
    const unchanged =
      !!saved &&
      saved.date === next.date &&
      saved.text === next.text &&
      saved.favorite === next.favorite;
    const result =
      unchanged && !hasDraft
        ? { ok: true, message: null }
        : saveDraft("growth", unchanged ? null : next);
    setHasDraft(!unchanged || !result.ok);
    setDraftError(
      result.ok ? "" : result.message || "Je concept kon niet worden bewaard.",
    );
  };
  const clear = (saved = false) => {
    const result = hasDraft
      ? saveDraft("growth", null)
      : { ok: true, message: null };
    if (!result.ok) {
      setCleanupPending(saved || cleanupPending);
      setDraftError(
        saved || cleanupPending
          ? "Je moment is opgeslagen, maar het concept kon niet worden opgeruimd. Probeer het afronden opnieuw."
          : result.message || "Je concept kon niet worden gewist.",
      );
      requestAnimationFrame(() => saveFeedback.current?.focus());
      return;
    }
    setEntry(empty());
    setHasDraft(false);
    setCleanupPending(false);
    setDiscarding(false);
    setError("");
    setDraftError("");
    setActionError(null);
    setDateError("");
    textField.current?.focus();
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (cleanupPending) {
      clear(true);
      return;
    }
    if (!entry.text.trim()) {
      setError(
        "Schrijf iets op dat je wilt bewaren. Een paar woorden is genoeg.",
      );
      textField.current?.focus();
      return;
    }
    const parsedDate = new Date(`${entry.date}T12:00:00`);
    const [year, month, day] = entry.date.split("-").map(Number);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      entry.date < "1900-01-01" ||
      entry.date > currentDate ||
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() + 1 !== month ||
      parsedDate.getDate() !== day
    ) {
      setDateError("Kies een geldige datum tussen 1 januari 1900 en vandaag.");
      dateField.current?.focus();
      return;
    }
    setDateError("");
    const existing = state.growth.find((item) => item.id === entry.id);
    const next = {
      ...entry,
      id: entry.id === "new" ? crypto.randomUUID() : entry.id,
      text: entry.text.trim(),
    };
    if (
      onSave(
        {
          ...state,
          growth: existing
            ? state.growth.map((item) => (item.id === next.id ? next : item))
            : [next, ...state.growth],
        },
        existing
          ? "Je wijzigingen zijn opgeslagen."
          : "Je moment is opgeslagen.",
      )
    ) {
      setEntry(next);
      setError("");
      setDiscarding(false);
      clear(true);
    } else {
      setError(
        "Opslaan is niet gelukt. Je tekst blijft hier staan; probeer opnieuw.",
      );
      requestAnimationFrame(() => saveFeedback.current?.focus());
    }
  };
  return (
    <div className="dp-growth">
      <p className="dp-muted">
        Een klein plezier, iets dat lukte of zomaar een gedachte. Dit is altijd
        optioneel.
      </p>
      <form className="dp-growth-compose dp-card" onSubmit={save}>
        <label className="dp-field">
          {state.growth.some((item) => item.id === entry.id)
            ? "Moment bewerken"
            : "Wat wil je onthouden?"}
          <textarea
            ref={textField}
            rows={4}
            value={entry.text}
            maxLength={4000}
            onChange={(event) => update({ ...entry, text: event.target.value })}
            placeholder="Bijvoorbeeld: even buiten gelopen, ondanks een moeilijke ochtend."
            aria-invalid={!!error && !entry.text.trim()}
            required
          />
        </label>
        <label className="dp-field">
          Datum
          <input
            ref={dateField}
            type="date"
            aria-label="Datum"
            aria-invalid={!!dateError}
            aria-describedby={dateError ? "dp-growth-date-error" : undefined}
            value={entry.date}
            min="1900-01-01"
            max={currentDate}
            required
            onChange={(event) => {
              setDateError("");
              update({ ...entry, date: event.target.value });
            }}
          />
          {dateError && (
            <span id="dp-growth-date-error" className="dp-error" role="alert">
              {dateError}
            </span>
          )}
        </label>
        <label className="dp-toggle-label">
          <input
            type="checkbox"
            checked={entry.favorite}
            onChange={(event) =>
              update({ ...entry, favorite: event.target.checked })
            }
          />
          <span>Als favoriet markeren</span>
        </label>
        <p className="dp-muted">Je hoeft hierbij geen score in te vullen.</p>
        {hasDraft && <DraftNotice error={draftError} focusRef={saveFeedback} />}
        {error && (
          <p className="dp-error" role="alert" tabIndex={-1} ref={saveFeedback}>
            {error}
          </p>
        )}
        <div className="dp-row-actions">
          <button className="dp-button primary" type="submit">
            {cleanupPending
              ? "Afronden opnieuw proberen"
              : state.growth.some((item) => item.id === entry.id)
                ? "Wijzigingen opslaan"
                : "Moment opslaan"}
          </button>
          {hasDraft && (
            <button
              type="button"
              className="dp-button quiet"
              onClick={() => setDiscarding(true)}
            >
              Concept wissen
            </button>
          )}
          {!hasDraft && state.growth.some((item) => item.id === entry.id) && (
            <button
              type="button"
              className="dp-button quiet"
              onClick={() => clear()}
            >
              Bewerken sluiten
            </button>
          )}
        </div>
        {discarding && (
          <div
            className="dp-inline-confirm"
            role="group"
            aria-label="Concept van klein moment wissen"
          >
            <p>
              Je concept wissen? Eerder opgeslagen momenten blijven bestaan.
            </p>
            <div className="dp-row-actions">
              <button
                type="button"
                className="dp-button"
                onClick={() => clear()}
              >
                Ja, concept wissen
              </button>
              <button
                type="button"
                className="dp-button quiet"
                onClick={() => setDiscarding(false)}
              >
                Verder schrijven
              </button>
            </div>
          </div>
        )}
      </form>
      <section aria-labelledby="dp-growth-list-title">
        <div className="dp-section-head">
          <h2 id="dp-growth-list-title">Opgeslagen momenten</h2>
          <span className="dp-count">{state.growth.length}</span>
        </div>
        {!state.growth.length ? (
          <div className="dp-empty-inline">
            <h3>Hier hoeft nog niets te staan.</h3>
            <p>Je kunt later terugkomen als je iets wilt onthouden.</p>
          </div>
        ) : (
          <>
            <ul
              className="dp-growth-list"
              id="anchor-growth-records"
              ref={growthList}
            >
              {sortedGrowth.slice(0, visibleCount).map((item) => (
                <li key={item.id} tabIndex={-1} data-growth-id={item.id}>
                  <div>
                    <p className="dp-kicker">{dateLabel(item.date)}</p>
                    <p className="dp-growth-text">{item.text}</p>
                  </div>
                  <div className="dp-row-actions">
                    <button
                      className={`dp-button quiet ${item.favorite ? "dp-is-favorite" : ""}`}
                      disabled={hasDraft && entry.id === item.id}
                      aria-pressed={item.favorite}
                      aria-label={`${item.favorite ? "Uit favorieten halen" : "Als favoriet markeren"}: ${item.text.slice(0, 60)}`}
                      onClick={() => {
                        setActionError(null);
                        if (
                          !onSave(
                            {
                              ...state,
                              growth: state.growth.map((value) =>
                                value.id === item.id
                                  ? { ...value, favorite: !value.favorite }
                                  : value,
                              ),
                            },
                            item.favorite
                              ? "Het moment is niet meer als favoriet gemarkeerd."
                              : "Het moment is als favoriet gemarkeerd.",
                          )
                        ) {
                          showActionError(
                            item.id,
                            "De wijziging in je favorieten kon niet worden opgeslagen. Probeer opnieuw.",
                          );
                        } else if (!hasDraft && entry.id === item.id) {
                          setEntry({ ...entry, favorite: !item.favorite });
                        }
                      }}
                    >
                      <Heart
                        size={19}
                        fill={item.favorite ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      className="dp-button quiet"
                      disabled={hasDraft}
                      aria-label={`Moment bewerken: ${item.text.slice(0, 60)}`}
                      onClick={() => {
                        setEntry(item);
                        setHasDraft(false);
                        setCleanupPending(false);
                        setError("");
                        setDraftError("");
                        setActionError(null);
                        setRemoving(null);
                        setDiscarding(false);
                        setDateError("");
                        textField.current?.focus();
                      }}
                    >
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="dp-button quiet"
                      disabled={hasDraft && entry.id === item.id}
                      aria-label={`Moment verwijderen: ${item.text.slice(0, 60)}`}
                      onClick={() => {
                        setRemoving(item.id);
                        setError("");
                        setActionError(null);
                      }}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {removing === item.id && (
                    <div
                      className="dp-inline-confirm"
                      role="group"
                      aria-label="Moment verwijderen bevestigen"
                    >
                      <p>Dit moment verwijderen?</p>
                      <div className="dp-row-actions">
                        <button
                          className="dp-button"
                          onClick={() => {
                            if (
                              onSave(
                                {
                                  ...state,
                                  growth: state.growth.filter(
                                    (value) => value.id !== item.id,
                                  ),
                                },
                                "Je moment is verwijderd.",
                              )
                            ) {
                              setRemoving(null);
                              if (!hasDraft && entry.id === item.id) {
                                setEntry(empty());
                                setError("");
                                setDateError("");
                              }
                              textField.current?.focus();
                            } else
                              showActionError(
                                item.id,
                                "Verwijderen is niet gelukt. Je moment blijft bewaard.",
                              );
                          }}
                        >
                          Ja, verwijderen
                        </button>
                        <button
                          className="dp-button quiet"
                          onClick={() => {
                            setRemoving(null);
                            setActionError(null);
                          }}
                        >
                          Behouden
                        </button>
                      </div>
                    </div>
                  )}
                  {actionError?.id === item.id && (
                    <p
                      className="dp-error dp-list-error"
                      role="alert"
                      tabIndex={-1}
                      ref={actionErrorField}
                    >
                      {actionError.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {state.growth.length > 50 && (
              <div className="dp-history-pagination">
                <p className="dp-muted" role="status">
                  Je ziet {Math.min(visibleCount, state.growth.length)} van{" "}
                  {state.growth.length} kleine momenten.
                </p>
                {visibleCount < state.growth.length && (
                  <button
                    type="button"
                    className="dp-button"
                    aria-controls="anchor-growth-records"
                    onClick={() => {
                      const firstAdded = visibleCount;
                      setVisibleCount((count) => count + 50);
                      requestAnimationFrame(() =>
                        growthList.current
                          ?.querySelectorAll<HTMLElement>(":scope > li")
                          [firstAdded]?.focus(),
                      );
                    }}
                  >
                    Meer kleine momenten tonen
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function SettingsView({
  state,
  onSave,
  onExport,
  onImport,
  onPrivacy,
  readOnly = false,
  blocked = false,
}: {
  state: AppState;
  onSave: Save;
  onExport: () => void;
  onImport: () => void;
  onPrivacy: () => void;
  readOnly?: boolean;
  blocked?: boolean;
}) {
  const [error, setError] = useState("");
  const errorField = useRef<HTMLParagraphElement>(null);
  const save = (next: AppState, message: string) => {
    const saved = onSave(next, message);
    setError(
      saved ? "" : "De instelling kon niet worden opgeslagen. Probeer opnieuw.",
    );
    if (!saved) requestAnimationFrame(() => errorField.current?.focus());
  };
  return (
    <div className="dp-settings">
      <section
        className="dp-settings-section dp-card"
        aria-labelledby="dp-appearance"
      >
        <h2 id="dp-appearance">Uiterlijk</h2>
        <fieldset className="dp-theme-options">
          <legend>Weergave</legend>
          {(
            [
              ["light", "Licht", "Lichte achtergrond"],
              ["dark", "Donker", "Donkere achtergrond"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={state.theme === value ? "dp-theme-selected" : ""}
            >
              <input
                type="radio"
                aria-label={label}
                disabled={readOnly || blocked}
                name="anchor-theme"
                value={value}
                checked={state.theme === value}
                onChange={() =>
                  save(
                    { ...state, theme: value },
                    `Je gebruikt nu het ${value === "light" ? "lichte" : "donkere"} thema.`,
                  )
                }
              />
              <span>
                {label}
                <span className="dp-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset
          className="dp-theme-options dp-palette-options"
          aria-describedby="anchor-palette-hint"
        >
          <legend>Kleurpalet</legend>
          <p id="anchor-palette-hint" className="dp-muted dp-palette-hint">
            Kies de kleuren die bij je passen. Elk palet werkt in licht en
            donker.
          </p>
          {palettes.map(({ id, name, description }) => (
            <label
              key={id}
              className={state.palette === id ? "dp-theme-selected" : ""}
            >
              <input
                type="radio"
                name="anchor-palette"
                aria-label={name}
                aria-describedby={`anchor-palette-${id}`}
                disabled={readOnly || blocked}
                checked={state.palette === id}
                value={id}
                onChange={() =>
                  save(
                    { ...state, palette: id },
                    `Kleurpalet ${name} ingesteld.`,
                  )
                }
              />
              <span className="dp-palette-card">
                <span className="dp-palette-name">{name}</span>
                <span className="dp-muted" id={`anchor-palette-${id}`}>
                  {description}
                </span>
                <span
                  className="dp-palette-swatches"
                  data-palette-preview={id}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="dp-setting-toggle">
          <span>
            <strong>Kleine momenten op Vandaag</strong>
            <span className="dp-muted">
              Toon een opgeslagen moment en een link naar je verzameling.
            </span>
          </span>
          <input
            type="checkbox"
            disabled={readOnly || blocked}
            checked={state.homeShowGrowth}
            onChange={(event) =>
              save(
                { ...state, homeShowGrowth: event.target.checked },
                event.target.checked
                  ? "Kleine momenten staan op Vandaag."
                  : "Kleine momenten zijn verborgen op Vandaag.",
              )
            }
          />
        </label>
        {error && (
          <p className="dp-error" role="alert" tabIndex={-1} ref={errorField}>
            {error}
          </p>
        )}
      </section>
      <section
        className="dp-settings-section dp-card"
        aria-labelledby="dp-backup"
      >
        <h2 id="dp-backup">Back-up van je gegevens</h2>
        <p>
          Anchor bewaart je registraties op dit apparaat, in deze browser. Maak
          zelf een back-up om ze naar een ander apparaat mee te nemen of later
          te herstellen.
        </p>
        <p className="dp-muted">
          Een back-up bevat alleen opgeslagen registraties. Sla open concepten
          eerst op als je die ook wilt meenemen.
        </p>
        <p className="dp-muted">
          Een back-up bevat persoonlijke gegevens en is niet versleuteld. Bewaar
          het bestand op een plek die je vertrouwt.
        </p>
        <div className="dp-row-actions">
          <button
            className="dp-button primary"
            onClick={onExport}
            disabled={blocked}
          >
            Back-up downloaden
          </button>
          <button
            className="dp-button quiet"
            onClick={onImport}
            disabled={readOnly || blocked}
          >
            Back-up herstellen
          </button>
        </div>
      </section>
      <section
        className="dp-settings-section dp-card"
        aria-labelledby="dp-about"
      >
        <h2 id="dp-about">Over Anchor</h2>
        <dl className="dp-settings-list">
          <div>
            <dt>Taal</dt>
            <dd>Nederlands</dd>
          </div>
          <div>
            <dt>Synchronisatie</dt>
            <dd>
              Je gegevens blijven in deze browser. Er is geen account of
              automatische synchronisatie tussen apparaten.
            </dd>
          </div>
          <div>
            <dt>Updates</dt>
            <dd>
              De app kan worden bijgewerkt zonder je bewaarde registraties te
              wissen. Wis de browsergegevens alleen als je een back-up hebt.
            </dd>
          </div>
        </dl>
        <button className="dp-button quiet" onClick={onPrivacy}>
          Over je gegevens <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
