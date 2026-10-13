import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Heart,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  AppState,
  EmotionRating,
  Goal,
  Moment,
  Ratings,
} from "./lib/storage";
import { today, loadDrafts, saveDraft } from "./lib/storage";
import type { Palette } from "./lib/palettes";
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
  Alcohol: "Alcohol",
  Nicotine: "Nicotine",
  Cannabis: "Cannabis",
  Cocaine: "Cocaine",
  "3-MMC": "3-MMC",
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
function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    ...(year !== new Date().getFullYear() ? { year: "numeric" as const } : {}),
  }).format(new Date(year, month - 1, day, 12));
}
function recentStart() {
  const [year, month, day] = today().split("-").map(Number);
  const date = new Date(year, month - 1, day - 6, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function moodLabel(value: number | null) {
  return value === null
    ? "niet ingevuld"
    : value > 0
      ? `+${value}`
      : String(value);
}
function ratingsSearchText(ratings: Ratings | null) {
  return `${ratings?.emotionRatings?.map((emotion) => emotion.label).join(" ") || ""} ${ratings?.pans != null ? `pannetjes ${ratings.pans}/5` : ""}`;
}
function momentSearchText(moment: Moment) {
  return `${moment.note} ${moment.activity} ${moment.emotions.join(" ")} ${ratingsSearchText(moment.before)} ${ratingsSearchText(moment.after)} check-in`.toLocaleLowerCase(
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

export function HistoryView({
  state,
  onOpenMoment,
  onOpenDay,
  onOpenCraving,
}: {
  state: AppState;
  onOpenMoment: (id: string) => void;
  onOpenDay: (date: string) => void;
  onOpenCraving: (id: string) => void;
}) {
  const [period, setPeriod] = useState("week");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => setVisibleCount(50), [period, kind, query]);
  const entries = useMemo(() => {
    const start = recentStart();
    const withinPeriod = (date: string) =>
      period === "all" || (date >= start && date <= today());
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
          (period === "all" || (item.date >= start && item.date <= today())) &&
          (kind === "all" || kind === "day") &&
          `${item.note} ${ratingsSearchText(item.ratings)} mijn hele dag dagsamenvatting`
            .toLocaleLowerCase("nl-NL")
            .includes(search),
      )
      .map((item) => ({
        type: "day" as const,
        item,
        date: item.date,
        time: "23:59",
      }));
    const cravings = state.cravings
      .filter(
        (item) =>
          (period === "all" || (item.date >= start && item.date <= today())) &&
          (kind === "all" || kind === "craving") &&
          `${item.situation} ${item.thought} ${item.bodySensation} ${item.emotion} ${item.behavior} craving drang`
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
  }, [state.moments, state.days, state.cravings, period, kind, query]);
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
                label: "Moment",
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
        (point.date >= recentStart() && point.date <= today()),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const graphPoints = observations.slice(-40);
  const visibleEntries = entries.slice(0, visibleCount);
  return (
    <div className="dp-history">
      <div className="dp-history-filters dp-card">
        <label className="dp-field">
          Periode
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">7 dagen</option>
            <option value="all">Alle dagen</option>
          </select>
        </label>
        <label className="dp-field">
          Soort registratie
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Alles</option>
            <option value="checkin">Check-ins</option>
            <option value="craving">Cravings</option>
            <option value="day">Mijn hele dag</option>
          </select>
        </label>
        <label className="dp-field dp-history-search">
          <span>
            <Search size={16} aria-hidden="true" /> Zoeken
          </span>
          <input
            type="search"
            placeholder="Situatie, gedachte, emotie of activiteit"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {(kind === "all" || kind === "checkin") && (
        <section
          className="dp-mood-plot dp-card"
          aria-labelledby="dp-mood-plot-title"
        >
          <div className="dp-section-head">
            <div>
              <h2 id="dp-mood-plot-title">Stemming per moment</h2>
              <p className="dp-muted">
                Losse metingen van −2 tot +2. Je dagsamenvatting blijft apart.
              </p>
            </div>
            <span className="dp-count">
              {observations.length}{" "}
              {observations.length === 1 ? "meting" : "metingen"}
            </span>
          </div>
          {graphPoints.length ? (
            <>
              <div className="dp-chart-frame">
                <div className="dp-chart-axis" aria-hidden="true">
                  {[2, 1, 0, -1, -2].map((value) => (
                    <span key={value}>{moodLabel(value)}</span>
                  ))}
                </div>
                <svg
                  viewBox="0 0 640 160"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${graphPoints.length} stemmingsmetingen in volgorde. De waarden staan in de uitklapbare lijst hieronder.`}
                >
                  {[-2, -1, 0, 1, 2].map((value) => (
                    <g key={value}>
                      <line
                        x1="35"
                        x2="624"
                        y1={80 - value * 29}
                        y2={80 - value * 29}
                        className="dp-plot-guide"
                      />
                    </g>
                  ))}
                  {graphPoints.map((point, index) => (
                    <circle
                      key={point.id}
                      cx={
                        graphPoints.length === 1
                          ? 320
                          : 50 + (index / (graphPoints.length - 1)) * 558
                      }
                      cy={80 - point.mood * 29}
                      r="5"
                      vectorEffect="non-scaling-stroke"
                      className={
                        point.label === "Nameting"
                          ? "dp-plot-after"
                          : "dp-plot-before"
                      }
                    >
                      <title>
                        {dateLabel(point.date)} {point.time} · {point.label} ·
                        stemming {moodLabel(point.mood)}
                      </title>
                    </circle>
                  ))}
                </svg>
              </div>
              <div className="dp-chart-dates" aria-hidden="true">
                <span>{dateLabel(graphPoints[0].date)}</span>
                <span>
                  {dateLabel(graphPoints[graphPoints.length - 1].date)}
                </span>
              </div>
              <p className="dp-plot-key">
                <span>
                  <i aria-hidden="true" /> Moment
                </span>
                <span>
                  <i className="dp-key-after" aria-hidden="true" /> Nameting
                </span>
              </p>
              <details className="dp-observation-details">
                <summary>
                  Meetwaarden van de grafiek als tekst ({graphPoints.length})
                </summary>
                <ul>
                  {graphPoints.map((point) => (
                    <li key={point.id}>
                      <span>
                        {dateLabel(point.date)} · {point.time} · {point.label}
                      </span>
                      <strong>Stemming {moodLabel(point.mood)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
              {observations.length > 40 && (
                <p className="dp-muted">
                  De grafiek en tekstlijst tonen de laatste 40 metingen binnen
                  je selectie. Oudere metingen kun je via de registraties
                  openen.
                </p>
              )}
              <p className="dp-muted">
                Deze punten tonen je eigen observaties, geen bewijs dat een
                activiteit een verandering veroorzaakt.
              </p>
            </>
          ) : (
            <p className="dp-empty-inline">
              Nog geen stemmingsmetingen binnen deze selectie. Notities en
              dagsamenvattingen blijven hieronder zichtbaar.
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="dp-history-entries">
        <div className="dp-section-head">
          <h2 id="dp-history-entries">Registraties</h2>
          <p className="dp-muted" role="status">
            {entries.length} gevonden
          </p>
        </div>
        {entries.length ? (
          <ol
            className="dp-history-list"
            id="anchor-history-records"
            ref={listRef}
          >
            {visibleEntries.map((entry) => (
              <li
                key={
                  entry.type === "day"
                    ? `day-${entry.date}`
                    : `${entry.type}-${entry.item.id}`
                }
              >
                <div className="dp-history-date">
                  <span>{dateLabel(entry.date)}</span>
                  <span>{entry.type === "day" ? "Hele dag" : entry.time}</span>
                </div>
                <div className="dp-history-entry">
                  <h3>
                    {entry.type === "day"
                      ? "Mijn hele dag"
                      : entry.type === "craving"
                        ? "Craving / drang"
                        : entry.item.activity || "Momentcheck-in"}
                  </h3>
                  <p className="dp-muted">
                    {entry.type === "day"
                      ? `Dagsamenvatting · stemming ${moodLabel(entry.item.ratings.mood)}`
                      : entry.type === "craving"
                        ? entry.item.situation || "Situatie niet ingevuld"
                        : `Momentcheck-in · stemming ${moodLabel(entry.item.before.mood)}${entry.item.after ? ` → ${moodLabel(entry.item.after.mood)}` : ""}`}
                  </p>
                  {entry.type === "moment" && (
                    <>
                      <HistoryRatings
                        before={entry.item.before}
                        after={entry.item.after}
                      />
                      {entry.item.emotions.length > 0 && (
                        <p className="dp-entry-note">
                          Emoties zonder gekoppelde score:{" "}
                          {entry.item.emotions.join(", ")}
                        </p>
                      )}
                    </>
                  )}
                  {entry.type === "day" && (
                    <HistoryRatings before={entry.item.ratings} />
                  )}
                  {entry.type === "craving" ? (
                    <dl className="dp-craving-summary">
                      {(
                        [
                          ["Gedachte", entry.item.thought],
                          ["Lichamelijk", entry.item.bodySensation],
                          ["Emotie", entry.item.emotion],
                          ["Gedrag", entry.item.behavior],
                        ] as const
                      )
                        .filter(([, value]) => value.trim())
                        .map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : (
                    entry.item.note && (
                      <p className="dp-entry-note">{entry.item.note}</p>
                    )
                  )}
                  {entry.type === "moment" && entry.item.activity && (
                    <span className="dp-history-state">
                      {entry.item.attempted === true
                        ? "Activiteit geprobeerd · "
                        : entry.item.attempted === false
                          ? "Activiteit niet geprobeerd · "
                          : ""}
                      {entry.item.after
                        ? `Nameting op ${dateLabel(entry.item.afterDate || entry.date)} om ${entry.item.afterTime}`
                        : "Nameting nog niet ingevuld"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="dp-button quiet"
                  aria-label={`Bekijk ${entry.type === "day" ? "hele dag" : entry.type === "craving" ? "craving" : "momentcheck-in"} van ${dateLabel(entry.date)}${entry.type !== "day" ? ` om ${entry.time}` : ""}`}
                  onClick={() =>
                    entry.type === "day"
                      ? onOpenDay(entry.date)
                      : entry.type === "craving"
                        ? onOpenCraving(entry.item.id)
                        : onOpenMoment(entry.item.id)
                  }
                >
                  Bekijk <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="dp-empty-inline">
            <h3>Geen registraties gevonden</h3>
            <p>Probeer een andere periode of verwijder je zoekterm.</p>
            <button
              className="dp-button quiet"
              onClick={() => {
                setPeriod("all");
                setKind("all");
                setQuery("");
              }}
            >
              Filters wissen
            </button>
          </div>
        )}
        {entries.length > 50 && (
          <div className="dp-history-pagination">
            <p className="dp-muted" role="status">
              Je ziet {visibleEntries.length} van {entries.length} registraties.
            </p>
            {visibleCount < entries.length && (
              <button
                className="dp-button"
                type="button"
                aria-controls="anchor-history-records"
                onClick={() => {
                  const firstAdded = visibleEntries.length;
                  setVisibleCount((count) => count + 50);
                  requestAnimationFrame(() =>
                    listRef.current
                      ?.querySelectorAll<HTMLButtonElement>("li > button")
                      [firstAdded]?.focus(),
                  );
                }}
              >
                Meer registraties tonen
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftNotice({ error }: { error: string }) {
  return error ? (
    <p className="dp-error" role="alert">
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
  const [planError, setPlanError] = useState("");
  const [planDraftError, setPlanDraftError] = useState("");
  const [discardingPlan, setDiscardingPlan] = useState(false);
  const goalName = useRef<HTMLInputElement>(null);
  const goalTarget = useRef<HTMLSelectElement>(null);
  const goalDirection = useRef<HTMLSelectElement>(null);
  const goalDescription = useRef<HTMLInputElement>(null);
  const planStart = useRef<HTMLTextAreaElement>(null);
  const planDirty = useRef(!!loadDrafts().plan);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!planDirty.current) setPlan(state.plan);
  }, [state.plan]);
  useEffect(() => {
    if (goal) goalTarget.current?.focus();
  }, [goal?.id]);
  function updateGoal(next: Goal) {
    setGoal(next);
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
  function clearGoal() {
    const result = saveDraft("goal", null);
    if (!result.ok) {
      setDraftError(result.message || "Het concept kon niet worden gewist.");
      return;
    }
    setGoal(null);
    setGoalHasDraft(false);
    setDiscarding(false);
    setGoalError("");
    setDraftError("");
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    if (!goal) return;
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
        existing ? "Je doel is aangepast." : "Je doel is toegevoegd.",
      )
    )
      clearGoal();
    else
      setGoalError(
        "Opslaan is niet gelukt. Je wijzigingen blijven in het formulier staan.",
      );
  }
  function updatePlan(next: AppState["plan"]) {
    setPlan(next);
    planDirty.current = true;
    const result = saveDraft("plan", next);
    setPlanDraftError(
      result.ok ? "" : result.message || "Je concept kon niet worden bewaard.",
    );
  }
  function savePlan(event: React.FormEvent) {
    event.preventDefault();
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
      const result = saveDraft("plan", null);
      planDirty.current = !result.ok;
      setPlanDraftError(
        result.ok
          ? ""
          : result.message ||
              "Je plan is opgeslagen, maar het concept kon niet worden gewist.",
      );
    } else
      setPlanError(
        "Opslaan is niet gelukt. Je tekst blijft hier staan; probeer opnieuw.",
      );
  }
  return (
    <div className="dp-plan">
      <section aria-labelledby="dp-goals-title">
        <div className="dp-section-head">
          <h2 id="dp-goals-title">Doelen en middelen</h2>
          <button
            ref={addButton}
            className="dp-button quiet"
            onClick={() => openGoal()}
          >
            <Plus size={17} aria-hidden="true" />
            {goal ? "Naar je concept" : "Doel toevoegen"}
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
                  aria-label={`Bewerk doel ${goalLabel(item)}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Aanpassen
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
                        } else
                          setGoalError(
                            "Verwijderen is niet gelukt. Je doel staat nog in de lijst.",
                          );
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
                    <p className="dp-error" role="alert">
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
                ? "Doel aanpassen"
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
            {goalHasDraft && <DraftNotice error={draftError} />}
            {goalError && (
              <p className="dp-error" role="alert">
                {goalError}
              </p>
            )}
            <div className="dp-row-actions">
              <button className="dp-button primary" type="submit">
                <Check size={17} aria-hidden="true" />
                Doel opslaan
              </button>
              <button
                className="dp-button quiet"
                type="button"
                onClick={() => setDiscarding(true)}
              >
                Concept wissen
              </button>
            </div>
            {discarding && (
              <div
                className="dp-inline-confirm"
                role="group"
                aria-label="Concept van doel wissen"
              >
                <p>
                  De wijzigingen in dit formulier wissen? Een eerder opgeslagen
                  doel blijft bestaan.
                </p>
                <div className="dp-row-actions">
                  <button
                    type="button"
                    className="dp-button"
                    onClick={clearGoal}
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
        )}
      </section>
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
        <DraftNotice error={planDraftError} />
        {planError && (
          <p className="dp-error" role="alert">
            {planError}
          </p>
        )}
        <div className="dp-row-actions">
          <button className="dp-button primary" type="submit">
            Mijn plan opslaan
          </button>
          {planDirty.current && (
            <button
              className="dp-button quiet"
              type="button"
              onClick={() => setDiscardingPlan(true)}
            >
              Wijzigingen verwerpen
            </button>
          )}
        </div>
        {discardingPlan && (
          <div
            className="dp-inline-confirm"
            role="group"
            aria-label="Concept van persoonlijk plan wissen"
          >
            <p>
              Je onopgeslagen wijzigingen wissen en je bewaarde plan
              terugzetten?
            </p>
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
                    return;
                  }
                  planDirty.current = false;
                  setPlan(state.plan);
                  setPlanError("");
                  setPlanDraftError("");
                  setDiscardingPlan(false);
                  requestAnimationFrame(() => planStart.current?.focus());
                }}
              >
                Ja, wijzigingen verwerpen
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
    </div>
  );
}

export function GrowthView({
  state,
  onSave,
}: {
  state: AppState;
  onSave: Save;
}) {
  type Growth = AppState["growth"][number];
  const empty = (): Growth => ({
    id: crypto.randomUUID(),
    date: today(),
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
  const textField = useRef<HTMLTextAreaElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const actionErrorField = useRef<HTMLParagraphElement>(null);
  const showActionError = (id: string, message: string) => {
    setActionError({ id, message });
    requestAnimationFrame(() => actionErrorField.current?.focus());
  };
  const update = (next: Growth) => {
    setEntry(next);
    setHasDraft(true);
    const result = saveDraft("growth", next);
    setDraftError(
      result.ok ? "" : result.message || "Je concept kon niet worden bewaard.",
    );
  };
  const clear = () => {
    const result = saveDraft("growth", null);
    if (!result.ok) {
      setDraftError(result.message || "Je concept kon niet worden gewist.");
      return;
    }
    setEntry(empty());
    setHasDraft(false);
    setDiscarding(false);
    setError("");
    setDraftError("");
    setActionError(null);
    setDateError("");
    textField.current?.focus();
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
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
      entry.date > today() ||
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
          ? "Je fijne moment is aangepast."
          : "Je fijne moment is bewaard.",
      )
    )
      clear();
    else
      setError(
        "Opslaan is niet gelukt. Je tekst blijft hier staan; probeer opnieuw.",
      );
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
            ? "Je fijne moment aanpassen"
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
            max={today()}
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
          <span>Als favoriet bewaren</span>
        </label>
        <p className="dp-muted">Je hoeft hierbij geen score in te vullen.</p>
        {hasDraft && <DraftNotice error={draftError} />}
        {error && (
          <p className="dp-error" role="alert">
            {error}
          </p>
        )}
        <div className="dp-row-actions">
          <button className="dp-button primary" type="submit">
            {state.growth.some((item) => item.id === entry.id)
              ? "Wijzigingen bewaren"
              : "Moment bewaren"}
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
        </div>
        {discarding && (
          <div
            className="dp-inline-confirm"
            role="group"
            aria-label="Concept van fijn moment wissen"
          >
            <p>
              De wijzigingen in dit formulier wissen? Eerder bewaarde momenten
              blijven bestaan.
            </p>
            <div className="dp-row-actions">
              <button type="button" className="dp-button" onClick={clear}>
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
          <h2 id="dp-growth-list-title">Wat je hebt bewaard</h2>
          <span className="dp-count">{state.growth.length}</span>
        </div>
        {!state.growth.length ? (
          <div className="dp-empty-inline">
            <h3>Hier hoeft nog niets te staan.</h3>
            <p>Je kunt later terugkomen als je iets wilt onthouden.</p>
          </div>
        ) : (
          <ul className="dp-growth-list">
            {[...state.growth]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((item) => (
                <li key={item.id}>
                  <div>
                    <p className="dp-kicker">{dateLabel(item.date)}</p>
                    <p className="dp-growth-text">{item.text}</p>
                  </div>
                  <div className="dp-row-actions">
                    <button
                      className={`dp-button quiet ${item.favorite ? "dp-is-favorite" : ""}`}
                      disabled={hasDraft && entry.id === item.id}
                      aria-pressed={item.favorite}
                      aria-label={`${item.favorite ? "Verwijder favoriet" : "Maak favoriet"}: ${item.text.slice(0, 60)}`}
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
                              ? "Favoriet verwijderd."
                              : "Als favoriet bewaard.",
                          )
                        )
                          showActionError(
                            item.id,
                            "De favoriet kon niet worden aangepast. Probeer opnieuw.",
                          );
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
                      aria-label={`Bewerk fijn moment: ${item.text.slice(0, 60)}`}
                      onClick={() => {
                        update(item);
                        setError("");
                        setActionError(null);
                        setRemoving(null);
                        setDateError("");
                        textField.current?.focus();
                      }}
                    >
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="dp-button quiet"
                      disabled={hasDraft && entry.id === item.id}
                      aria-label={`Verwijder fijn moment: ${item.text.slice(0, 60)}`}
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
                      aria-label="Verwijderen van fijn moment bevestigen"
                    >
                      <p>Dit fijne moment verwijderen?</p>
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
                                "Het fijne moment is verwijderd.",
                              )
                            ) {
                              setRemoving(null);
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
      saved ? "" : "De instelling kon niet worden bewaard. Probeer opnieuw.",
    );
    if (!saved) requestAnimationFrame(() => errorField.current?.focus());
  };
  return (
    <div className="dp-settings">
      <section
        className="dp-settings-section dp-card"
        aria-labelledby="dp-appearance"
      >
        <h2 id="dp-appearance">Weergave</h2>
        <fieldset className="dp-theme-options">
          <legend>Kleurthema</legend>
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
            <strong>Fijne momenten op Vandaag</strong>
            <span className="dp-muted">
              Een bewaard moment en een link naar je verzameling.
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
                  ? "Fijne momenten staan op Vandaag."
                  : "Fijne momenten zijn verborgen op Vandaag.",
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
        <h2 id="dp-backup">Je gegevens bewaren</h2>
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
            Back-up exporteren
          </button>
          <button
            className="dp-button quiet"
            onClick={onImport}
            disabled={readOnly || blocked}
          >
            Back-up importeren
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
          Privacy en opslag <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
