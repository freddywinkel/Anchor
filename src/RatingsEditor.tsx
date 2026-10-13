import { useId, useState, type InvalidEvent } from "react";
import type { EmotionRating, Ratings } from "./lib/storage";
import { MoodIllustration, PanIllustration } from "./FeelingIllustrations";

export const MOODS = ["Erg laag", "Laag", "Neutraal", "Goed", "Erg goed"];
const EMOTIONS = [
  "Bang",
  "Onrustig",
  "Verdrietig",
  "Boos",
  "Gefrustreerd",
  "Beschaamd",
  "Schuldig",
  "Eenzaam",
  "Teleurgesteld",
  "Onzeker",
  "Machteloos",
  "Blij",
  "Opgelucht",
  "Rustig",
  "Hoopvol",
  "Trots",
  "Dankbaar",
  "Verbonden",
];

export function revealInvalidField(event: InvalidEvent<HTMLElement>) {
  let parent = (event.target as HTMLElement).parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}
export const hasRating = (value: Ratings) =>
  value.mood !== null ||
  value.eis !== null ||
  value.pans != null ||
  !!value.emotionRatings?.some((emotion) => emotion.label.trim());

// Empty editor rows are draft scaffolding, never an answered emotion.
export function cleanRatings(value: Ratings): Ratings {
  return {
    ...value,
    ...(value.emotionRatings
      ? {
          emotionRatings: value.emotionRatings
            .filter(
              (emotion) => emotion.label.trim() || emotion.intensity !== null,
            )
            .map((emotion) => ({ ...emotion, label: emotion.label.trim() })),
        }
      : {}),
  };
}
export function followupRatings(before: Ratings): Ratings {
  return {
    mood: null,
    eis: null,
    ...(before.emotionRatings?.some((emotion) => emotion.label.trim())
      ? {
          emotionRatings: before.emotionRatings
            .filter((emotion) => emotion.label.trim())
            .map((emotion) => ({ ...emotion, intensity: null })),
        }
      : {}),
  };
}

export function RatingLine({
  value,
  label,
}: {
  value: Ratings;
  label?: string;
}) {
  return (
    <div className="dp-rating-line" aria-label={label}>
      <span>
        <i className="dp-dot" />
        {value.mood === null ? "Stemming niet ingevuld" : MOODS[value.mood + 2]}
      </span>
      {value.pans != null && (
        <span>
          Pannetjes: <b>{value.pans}/5</b>
        </span>
      )}
      {value.emotionRatings
        ?.filter((emotion) => emotion.label.trim())
        .map((emotion) => (
          <span key={emotion.id}>
            {emotion.label}:{" "}
            <b>
              {emotion.intensity == null
                ? "niet ingevuld"
                : `${emotion.intensity}/100`}
            </b>
          </span>
        ))}
      {value.eis !== null && (
        <span>
          Intensiteit — emotie niet gekoppeld: <b>{value.eis}/100</b>
        </span>
      )}
    </div>
  );
}

function EmotionEditor({
  value,
  onChange,
  prefix,
  day,
}: {
  value: Ratings;
  onChange: (value: Ratings) => void;
  prefix: string;
  day: boolean;
}) {
  const [placeholderId] = useState(() => crypto.randomUUID());
  const [customIds, setCustomIds] = useState<string[]>([]);
  const hintId = useId();
  const rows = value.emotionRatings?.length
    ? value.emotionRatings
    : [{ id: placeholderId, label: "", intensity: null }];
  function changeRow(id: string, patch: Partial<EmotionRating>) {
    onChange({
      ...value,
      emotionRatings: rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  }
  return (
    <section
      className="dp-emotion-editor"
      aria-labelledby={`${hintId}-heading`}
    >
      <h3 id={`${hintId}-heading`}>
        {prefix}
        {day ? "Emoties van deze dag" : "Welke emoties merk je?"}
        <span className="dp-optional">optioneel</span>
      </h3>
      <p className="dp-hint" id={hintId}>
        {day
          ? "Kies een emotie die vandaag opviel. Noteer hoe sterk die op het opvallendste moment was; dit is geen gemiddelde van je check-ins."
          : "Geef iedere emotie een eigen cijfer. Ook een prettig gevoel kan sterk zijn."}{" "}
        0 = niet voelbaar · 100 = zeer sterk voor jou. Een leeg cijfer blijft
        onbekend.
      </p>
      {rows.map((emotion, index) => {
        const custom =
          customIds.includes(emotion.id) ||
          (!emotion.label.trim() && emotion.intensity !== null) ||
          (!!emotion.label && !EMOTIONS.includes(emotion.label));
        return (
          <div className="dp-emotion-row" key={index}>
            <div className="dp-emotion-fields">
              <label className="dp-field">
                Emotie{rows.length > 1 ? ` ${index + 1}` : ""}
                <select
                  aria-label="Kies een emotie"
                  value={custom ? "__custom" : emotion.label}
                  onChange={(event) => {
                    const nextId = crypto.randomUUID();
                    if (event.target.value === "__custom")
                      setCustomIds((ids) => [...ids, nextId]);
                    changeRow(emotion.id, {
                      id: nextId,
                      label:
                        event.target.value === "__custom"
                          ? ""
                          : event.target.value,
                      intensity: null,
                    });
                  }}
                >
                  <option value="">Kies een emotie</option>
                  {EMOTIONS.map((label) => (
                    <option key={label}>{label}</option>
                  ))}
                  <option value="__custom">Eigen emotie</option>
                </select>
              </label>
              {custom && (
                <label className="dp-field">
                  Eigen emotie
                  <input
                    aria-label="Eigen emotie"
                    required={emotion.intensity !== null}
                    maxLength={150}
                    value={emotion.label}
                    onChange={(event) =>
                      changeRow(emotion.id, { label: event.target.value })
                    }
                  />
                </label>
              )}
              {(emotion.label.trim() || emotion.intensity !== null) && (
                <label className="dp-field dp-emotion-intensity">
                  Hoe sterk? <span className="dp-hint">0–100</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    step="1"
                    aria-label={`Intensiteit van ${emotion.label.trim() || "deze emotie"}`}
                    aria-describedby={hintId}
                    placeholder="Leeg"
                    value={emotion.intensity ?? ""}
                    onChange={(event) =>
                      changeRow(emotion.id, {
                        intensity:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
            </div>
            {(emotion.label || rows.length > 1 || custom) && (
              <button
                type="button"
                className="dp-text-button"
                aria-label={`Verwijder emotie ${emotion.label || index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    emotionRatings: rows.filter((row) => row.id !== emotion.id),
                  })
                }
              >
                Verwijderen
              </button>
            )}
          </div>
        );
      })}
      {rows.length < 20 && rows.every((emotion) => emotion.label.trim()) && (
        <button
          type="button"
          className="dp-button quiet"
          onClick={() =>
            onChange({
              ...value,
              emotionRatings: [
                ...rows,
                { id: crypto.randomUUID(), label: "", intensity: null },
              ],
            })
          }
        >
          Nog een emotie
        </button>
      )}
    </section>
  );
}

export function RatingsEditor({
  value,
  onChange,
  prefix = "",
  day = false,
}: {
  value: Ratings;
  onChange: (next: Ratings) => void;
  prefix?: string;
  day?: boolean;
}) {
  return (
    <div className="dp-ratings-editor" onInvalidCapture={revealInvalidField}>
      <fieldset>
        <legend>
          {prefix}
          {day ? "Stemming over de dag" : "Stemming"}
          <span className="dp-optional">optioneel</span>
        </legend>
        <div className="dp-mood-options">
          {MOODS.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.mood === index - 2}
              aria-label={`${index - 2 > 0 ? "+" : ""}${index - 2} ${label}`}
              onClick={() =>
                onChange({
                  ...value,
                  mood: value.mood === index - 2 ? null : index - 2,
                })
              }
            >
              <MoodIllustration mood={index - 2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {!day && (
        <fieldset className="dp-pans-editor">
          <legend>
            {prefix}Emotionele spanning{" "}
            <span className="dp-optional">optioneel</span>
          </legend>
          <p className="dp-hint">
            Hoe hoog loopt je spanning op? 1 = rustig · 5 = overweldigend. Kies
            wat nu bij je past.
          </p>
          <div className="dp-pans-options">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                type="button"
                key={level}
                aria-label={`Pannetje ${level} van 5`}
                aria-pressed={value.pans === level}
                onClick={() =>
                  onChange({
                    ...value,
                    pans: value.pans === level ? null : level,
                  })
                }
              >
                <PanIllustration level={level} />
                <span>{level}</span>
              </button>
            ))}
          </div>
          <p className="dp-hint dp-pans-caption">
            {value.pans == null
              ? "Nog niet ingevuld."
              : `Pannetje ${value.pans} van 5. Tik nogmaals om leeg te maken.`}
          </p>
        </fieldset>
      )}
      {day && value.pans != null && (
        <p className="dp-hint">Eerder vastgelegd pannetje: {value.pans}/5.</p>
      )}
      {day ? (
        <details
          className="dp-extra-fields"
          open={value.emotionRatings?.length ? true : undefined}
        >
          <summary>Emoties van de dag toevoegen</summary>
          <EmotionEditor
            value={value}
            onChange={onChange}
            prefix={prefix}
            day
          />
        </details>
      ) : (
        <EmotionEditor
          value={value}
          onChange={onChange}
          prefix={prefix}
          day={false}
        />
      )}
      {value.eis !== null && (
        <details className="dp-extra-fields dp-legacy-intensity">
          <summary>Eerder vastgelegde intensiteit: {value.eis}</summary>
          <label className="dp-field">
            Intensiteit — emotie niet gekoppeld
            <span className="dp-hint">
              Dit eerdere cijfer heeft geen vastgelegde koppeling aan een
              emotie. Het blijft afzonderlijk bewaard.
            </span>
            <input
              aria-label={`${prefix}Intensiteit — emotie niet gekoppeld`}
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              step="1"
              value={value.eis}
              onChange={(event) =>
                onChange({
                  ...value,
                  eis:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
        </details>
      )}
    </div>
  );
}
