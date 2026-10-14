import { useMemo, useRef, useState } from "react";
import type { AppState } from "./lib/storage";
import { RatingLine } from "./RatingsEditor";
import {
  buildWeekOverview,
  sleepDescription,
  type WeekDay,
  type WeekObservation,
} from "./lib/weekOverview";
import "./week.css";

const kindNames = {
  checkin: "Check-in",
  after: "Nameting",
  day: "Dagoverzicht",
};
export type WeekRecordTarget = {
  type: "moment" | "craving" | "day";
  id: string;
};
type OpenRecord = (target: WeekRecordTarget) => void;

function dateLabel(value: string, weekday = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", {
    ...(weekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function Observation({
  value,
  onOpenRecord,
}: {
  value: WeekObservation;
  onOpenRecord: OpenRecord;
}) {
  return (
    <li className="dp-week-observation" tabIndex={-1}>
      <strong>
        {kindNames[value.kind]}
        {value.time && ` · ${value.time}`}
      </strong>
      <RatingLine value={value.ratings} />
      {value.kind !== "day" && value.ratings.pans == null && (
        <p className="dp-muted">Spanning niet ingevuld.</p>
      )}
      {value.kind === "after" &&
        value.moment &&
        value.moment.date !== value.date && (
          <p className="dp-muted">
            Bij de check-in van {dateLabel(value.moment.date)} om{" "}
            {value.moment.time}.
          </p>
        )}
      {value.kind === "checkin" && value.moment?.activity && (
        <p className="dp-preserve-lines">
          Activiteit bij deze check-in: {value.moment.activity}. Geprobeerd:{" "}
          {value.moment.attempted === null
            ? "niet ingevuld"
            : value.moment.attempted
              ? "ja"
              : "nee"}
          .
        </p>
      )}
      {value.day && <p>Slaap: {sleepDescription(value.day)}.</p>}
      <button
        type="button"
        className="dp-text-button dp-week-record-link"
        aria-label={`Bekijk ${kindNames[value.kind].toLocaleLowerCase("nl-NL")} van ${dateLabel(value.date)}${value.time ? ` om ${value.time}` : ""}`}
        onClick={() =>
          onOpenRecord(
            value.day
              ? { type: "day", id: value.day.date }
              : { type: "moment", id: value.moment!.id },
          )
        }
      >
        Volledige registratie bekijken
      </button>
    </li>
  );
}

function WeekDayDetails({
  day,
  onOpenRecord,
}: {
  day: WeekDay;
  onOpenRecord: OpenRecord;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(20);
  const listRef = useRef<HTMLUListElement>(null);
  const total =
    day.observations.length + day.cravings.length + day.growth.length;
  if (!total) {
    return (
      <li className="dp-week-empty">
        <span>{dateLabel(day.date, true)}</span>
        <span className="dp-muted">Geen notities</span>
      </li>
    );
  }
  const summary = [
    {
      count: day.observations.filter((value) => value.kind === "checkin")
        .length,
      single: "check-in",
      plural: "check-ins",
    },
    {
      count: day.observations.filter((value) => value.kind === "after").length,
      single: "nameting",
      plural: "nametingen",
    },
    {
      count: day.observations.filter((value) => value.kind === "day").length,
      single: "dagoverzicht",
      plural: "dagoverzichten",
    },
    { count: day.cravings.length, single: "craving", plural: "cravings" },
    {
      count: day.growth.length,
      single: "klein moment",
      plural: "kleine momenten",
    },
  ]
    .filter((item) => item.count > 0)
    .map(
      (item) => `${item.count} ${item.count === 1 ? item.single : item.plural}`,
    )
    .join(" · ");
  const rows = open
    ? [
        ...day.observations.map((value) => ({
          key: value.id,
          element: (
            <Observation
              key={value.id}
              value={value}
              onOpenRecord={onOpenRecord}
            />
          ),
        })),
        ...day.cravings.map((value) => ({
          key: `craving:${value.id}`,
          element: (
            <li key={`craving:${value.id}`} tabIndex={-1}>
              <strong>Craving · {value.time}</strong>
              <p>Middel of gedrag: {value.substance || "niet ingevuld"}.</p>
              <button
                type="button"
                className="dp-text-button dp-week-record-link"
                aria-label={`Bekijk craving van ${dateLabel(value.date)} om ${value.time}`}
                onClick={() => onOpenRecord({ type: "craving", id: value.id })}
              >
                Volledige registratie bekijken
              </button>
            </li>
          ),
        })),
        ...day.growth.map((value) => ({
          key: `growth:${value.id}`,
          element: (
            <li key={`growth:${value.id}`} tabIndex={-1}>
              <strong>Klein moment</strong>
              <p className="dp-preserve-lines">{value.text}</p>
            </li>
          ),
        })),
      ]
    : [];
  return (
    <li>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <span>{dateLabel(day.date, true)}</span>
          <span className="dp-muted">{summary}</span>
        </summary>
        {open && (
          <div className="dp-week-day-body">
            <ul className="dp-week-observations" ref={listRef}>
              {rows.slice(0, visible).map((row) => row.element)}
            </ul>
            {visible < rows.length && (
              <button
                type="button"
                className="dp-button"
                onClick={() => {
                  const firstAdded = visible;
                  setVisible((count) => count + 20);
                  requestAnimationFrame(() =>
                    listRef.current
                      ?.querySelectorAll<HTMLElement>(":scope > li")
                      [firstAdded]?.focus(),
                  );
                }}
              >
                Meer van deze dag tonen ({rows.length - visible})
              </button>
            )}
          </div>
        )}
      </details>
    </li>
  );
}

export function WeekOverview({
  state,
  currentDate,
  onOpenRecord,
}: {
  state: AppState;
  currentDate: string;
  onOpenRecord: OpenRecord;
}) {
  const week = useMemo(
    () => buildWeekOverview(state, currentDate),
    [state, currentDate],
  );
  return (
    <section
      className="dp-card dp-week-overview"
      aria-labelledby="dp-week-title"
    >
      <h2 id="dp-week-title">Rustig terugkijken op je week</h2>
      <p className="dp-week-period">
        {dateLabel(week.start)} tot en met {dateLabel(week.end)}
      </p>
      <p>
        Notities op {week.recordedDays} van de 7 dagen. Je hoeft gemiste dagen
        niet in te halen.
      </p>
      <p className="dp-muted">
        Dit overzicht gebruikt alle notities in deze week. De filters voor soort
        en zoeken gelden voor de grafiek en registraties eronder.
      </p>
      <dl className="dp-week-counts">
        <div>
          <dt>Check-ins</dt>
          <dd>{week.coverage.checkin.total}</dd>
        </div>
        <div>
          <dt>Nametingen</dt>
          <dd>{week.coverage.after.total}</dd>
        </div>
        <div>
          <dt>Dagoverzichten</dt>
          <dd>{week.coverage.day.total}</dd>
        </div>
        <div>
          <dt>Cravingregistraties</dt>
          <dd>{week.cravings}</dd>
        </div>
        <div>
          <dt>Kleine momenten</dt>
          <dd>{week.growth}</dd>
        </div>
      </dl>
      <details className="dp-observation-details">
        <summary>Welke scores zijn ingevuld?</summary>
        <ul>
          {(["checkin", "after", "day"] as const).map((kind) => {
            const count = week.coverage[kind];
            return (
              <li key={kind}>
                <span>{kindNames[kind]}</span>
                <span>
                  Stemming: {count.mood} van {count.total} ingevuld
                  {kind !== "day" &&
                    ` · Spanning: ${count.pans} van ${count.total} ingevuld`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="dp-muted">
          Een nameting telt op de eigen datum. Elke meting blijft apart; er
          wordt geen daggemiddelde berekend. Niet ingevuld telt nooit als een
          nulscore.
        </p>
      </details>
      <ul className="dp-week-days" aria-label="De zeven dagen van je week">
        {week.days.map((day) => (
          <WeekDayDetails
            key={day.date}
            day={day}
            onOpenRecord={onOpenRecord}
          />
        ))}
      </ul>
      <p className="dp-muted">
        Geen cravingregistratie betekent niet automatisch dat er geen craving
        was. Ook met weinig of onvolledige notities trekt Anchor geen conclusies
        over patronen of risico.
      </p>
      <p>
        Wat gaf je ruimte, of welke kleine stap wil je meenemen? Alleen
        teruglezen is ook genoeg.
      </p>
    </section>
  );
}
