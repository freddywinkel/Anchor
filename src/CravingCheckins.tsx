import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Link2, Unlink } from "lucide-react";
import { RatingLine } from "./RatingsEditor";
import { eligibleCheckins } from "./lib/cravingLinks";
import type { AppState, CravingRecord, Moment } from "./lib/storage";
import "./craving-checkins.css";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function checkinLabel(moment: Moment) {
  return `${dateLabel(moment.date)} om ${moment.time}`;
}

export function LinkedCravingCheckin({ moment }: { moment: Moment }) {
  return (
    <div className="dp-linked-checkin-readout">
      <h3>
        <time dateTime={`${moment.date}T${moment.time}`}>
          {checkinLabel(moment)}
        </time>
      </h3>
      <RatingLine value={moment.before} label="Gevoel bij check-in" />
      {moment.emotions.length > 0 && (
        <p className="dp-preserve-lines">
          Emotiewoorden: {moment.emotions.join(", ")}
        </p>
      )}
      <p className="dp-preserve-lines dp-craving-checkin-note">
        {moment.note || "Geen notitie ingevuld."}
      </p>
      {moment.activity && (
        <p className="dp-preserve-lines">
          Activiteit: {moment.activity}
          {moment.attempted !== null &&
            ` · Geprobeerd: ${moment.attempted ? "ja" : "nee"}`}
        </p>
      )}
      {moment.after && (
        <div className="dp-craving-checkin-after">
          <p className="dp-muted">
            Nameting:{" "}
            {moment.afterDate
              ? dateLabel(moment.afterDate)
              : "datum niet ingevuld"}
            {" · "}
            {moment.afterTime || "tijd niet ingevuld"}
          </p>
          <RatingLine value={moment.after} label="Gevoel bij nameting" />
        </div>
      )}
    </div>
  );
}

export function CravingCheckins({
  record,
  state,
  onSave,
  navigate,
  readOnly = false,
}: {
  record: CravingRecord;
  state: AppState;
  onSave: (next: AppState, message: string) => boolean;
  navigate: (path: string) => void;
  readOnly?: boolean;
}) {
  const prefix = useId();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const saved = state.cravings.find((item) => item.id === record.id);
  const linked = state.moments
    .filter((item) => item.cravingId === record.id)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const candidates = saved ? eligibleCheckins(state, saved) : [];
  const selection = candidates.some((item) => item.id === selected)
    ? selected
    : "";

  useEffect(() => {
    if (selected && !selection) setSelected("");
  }, [selected, selection]);

  if (!saved) return null;

  function fail() {
    setFeedback("");
    setError(
      "De koppeling is niet gewijzigd. Probeer het opnieuw; je craving en check-in blijven bewaard.",
    );
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function link() {
    if (readOnly) return;
    const candidate = eligibleCheckins(state, saved!).find(
      (item) => item.id === selection,
    );
    if (!candidate) return;
    if (
      !onSave(
        {
          ...state,
          moments: state.moments.map((item) =>
            item.id === candidate.id ? { ...item, cravingId: record.id } : item,
          ),
        },
        "De check-in is gekoppeld.",
      )
    ) {
      fail();
      return;
    }
    setSelected("");
    setError("");
    setFeedback("Check-in gekoppeld.");
    requestAnimationFrame(() =>
      document.getElementById(`${prefix}-${candidate.id}`)?.focus(),
    );
  }

  function unlink(moment: Moment) {
    if (readOnly) return;
    const current = state.moments.find(
      (item) => item.id === moment.id && item.cravingId === record.id,
    );
    if (!current) return;
    if (
      !onSave(
        {
          ...state,
          moments: state.moments.map((item) => {
            if (item.id !== current.id) return item;
            const next = { ...item };
            delete next.cravingId;
            return next;
          }),
        },
        "De koppeling is verwijderd. Je check-in blijft bewaard.",
      )
    ) {
      fail();
      return;
    }
    setError("");
    setFeedback("Koppeling verwijderd. Je check-in blijft bewaard.");
    requestAnimationFrame(() => (selectRef.current || newRef.current)?.focus());
  }

  return (
    <section
      className="dp-card dp-craving-checkins"
      aria-labelledby={`${prefix}-title`}
    >
      <h2 id={`${prefix}-title`}>Later inchecken</h2>
      <p className="dp-muted">
        Leg later vast hoe je je voelt. Je stemming, emoties en eigen woorden
        blijven een aparte check-in, gekoppeld aan deze craving.
      </p>
      <button
        ref={newRef}
        type="button"
        className="dp-button"
        disabled={readOnly}
        onClick={() =>
          navigate(`/moment/new?craving=${encodeURIComponent(record.id)}`)
        }
      >
        Nieuwe check-in bij deze craving
        <ArrowRight size={18} aria-hidden="true" />
      </button>

      {linked.length ? (
        <ul
          className="dp-craving-checkin-list"
          aria-label="Gekoppelde check-ins"
        >
          {linked.map((moment) => (
            <li key={moment.id}>
              <article
                id={`${prefix}-${moment.id}`}
                data-linked-checkin-id={moment.id}
                tabIndex={-1}
                aria-label={`Check-in van ${checkinLabel(moment)}`}
              >
                <LinkedCravingCheckin moment={moment} />
                <div className="dp-actions">
                  <button
                    type="button"
                    className="dp-button quiet"
                    disabled={readOnly}
                    onClick={() =>
                      navigate(
                        `/moment/${encodeURIComponent(moment.id)}?returnCraving=${encodeURIComponent(record.id)}`,
                      )
                    }
                    aria-label={`Check-in openen van ${checkinLabel(moment)}`}
                  >
                    Check-in openen
                  </button>
                  <button
                    type="button"
                    className="dp-button quiet"
                    disabled={readOnly}
                    onClick={() => unlink(moment)}
                    aria-label={`Koppeling verwijderen van check-in van ${checkinLabel(moment)}`}
                  >
                    <Unlink size={16} aria-hidden="true" />
                    Koppeling verwijderen
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dp-muted dp-craving-checkins-empty">
          Nog geen check-ins gekoppeld. Je hoeft nu niets extra in te vullen.
        </p>
      )}

      <div className="dp-craving-checkin-existing">
        {candidates.length ? (
          <>
            <label className="dp-field">
              Bestaande check-in
              <span className="dp-hint">
                Alleen losse check-ins op of na dit cravingmoment.
              </span>
              <select
                ref={selectRef}
                aria-label="Bestaande check-in"
                value={selection}
                disabled={readOnly}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setError("");
                  setFeedback("");
                }}
              >
                <option value="">Kies een check-in</option>
                {candidates.map((moment) => (
                  <option key={moment.id} value={moment.id}>
                    {checkinLabel(moment)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="dp-button quiet"
              disabled={readOnly || !selection}
              onClick={link}
            >
              <Link2 size={16} aria-hidden="true" />
              Check-in koppelen
            </button>
          </>
        ) : (
          <p className="dp-muted">
            Geen losse check-ins vanaf dit cravingmoment.
          </p>
        )}
      </div>
      {error && (
        <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      <p className="dp-muted dp-craving-checkin-feedback" role="status">
        {feedback}
      </p>
    </section>
  );
}
