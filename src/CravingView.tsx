import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  clockTime,
  today,
  type AppState,
  type CravingRecord,
} from "./lib/storage";
import { CRAVING_SUGGESTIONS } from "./lib/cravingSuggestions";
import { cravingSubstances, withCravingSubstances } from "./lib/substances";
import { CravingSubstances } from "./CravingSubstances";
import { CravingUseAction } from "./CravingUseAction";
import "./craving.css";

type CravingViewProps = {
  record?: CravingRecord;
  state: AppState;
  onSave: (next: AppState, message: string) => boolean;
  navigate: (path: string) => void;
  onDraft: (value: CravingRecord) => void;
  draft?: CravingRecord;
  onClear: () => boolean;
  onCompleted: (id: string) => void;
  onUseChange: (id: string, used: boolean) => boolean;
  onSupport: () => void;
  returnTo?: string;
};

const narrativeFields = [
  "situation",
  "thought",
  "bodySensation",
  "emotion",
  "behavior",
] as const;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T12:00:00`);
  return (
    year >= 1900 &&
    year <= 2199 &&
    Number.isFinite(parsed.getTime()) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === Number(value.slice(5, 7)) &&
    parsed.getDate() === Number(value.slice(8, 10))
  );
}

function dayLabel(value: string): string {
  if (!validDate(value)) return "De dag volgt automatisch uit de datum.";
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function CravingView({
  record,
  state,
  onSave,
  navigate,
  onDraft,
  draft,
  onClear,
  onCompleted,
  onUseChange,
  onSupport,
  returnTo = "/today",
}: CravingViewProps) {
  const [value, setValue] = useState<CravingRecord>(
    () =>
      draft ??
      record ?? {
        id: crypto.randomUUID(),
        date: today(),
        time: clockTime(),
        situation: "",
        thought: "",
        bodySensation: "",
        emotion: "",
        behavior: "",
      },
  );
  const [error, setError] = useState<{ message: string } | null>(null);
  const [resumedDraft] = useState(() => draft);
  const [pendingCompletion, setPendingCompletion] = useState<
    "saved" | "deleted" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const prefix = useId();
  const dateHintId = `${prefix}-day`;
  const confirmationTitleId = `${prefix}-delete-title`;
  const confirmationDescriptionId = `${prefix}-delete-description`;
  const dirty =
    !record ||
    JSON.stringify({
      ...record,
      usedAfterCraving: undefined,
      usedConfirmedAt: undefined,
    }) !==
      JSON.stringify({
        ...value,
        usedAfterCraving: undefined,
        usedConfirmedAt: undefined,
      });

  useEffect(() => {
    if (confirmDelete) cancelDeleteRef.current?.focus();
  }, [confirmDelete]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [error]);

  function showError(message: string) {
    // A new object reveals the same error again after another failed attempt.
    setError({ message });
  }

  function complete(action: "saved" | "deleted") {
    if (onClear()) {
      if (action === "saved") onCompleted(value.id);
      else navigate(returnTo);
      return;
    }
    setPendingCompletion(action);
    showError(
      action === "saved"
        ? "Je craving is opgeslagen, maar het concept kon niet worden opgeruimd. Probeer opnieuw."
        : "Je craving is verwijderd, maar het concept kon niet worden opgeruimd. Probeer opnieuw.",
    );
  }

  function update<K extends keyof CravingRecord>(
    field: K,
    fieldValue: CravingRecord[K],
  ) {
    const next = { ...value, [field]: fieldValue };
    setValue(next);
    onDraft(next);
    setError(null);
  }

  function updateSubstances(names: string[]) {
    const next = withCravingSubstances(value, names);
    setValue(next);
    onDraft(next);
    setError(null);
  }

  function addSuggestion(
    field: "thought" | "bodySensation" | "emotion",
    suggestion: string,
  ) {
    if (!suggestion) return;
    const current = value[field];
    if (
      current
        .split(/\r?\n/)
        .some(
          (line) =>
            line.trim().toLocaleLowerCase("nl-NL") ===
            suggestion.toLocaleLowerCase("nl-NL"),
        )
    )
      return;
    const next =
      current + (current && !current.endsWith("\n") ? "\n" : "") + suggestion;
    if (next.length > 4000) {
      showError(
        "Dit voorbeeld past niet meer in het tekstvak. Je bestaande tekst is behouden.",
      );
      return;
    }
    update(field, next);
  }

  function suggestionPicker(
    field: "thought" | "bodySensation" | "emotion",
    label: string,
  ) {
    return (
      <select
        className="anchor-craving-suggestions"
        aria-label={`Voorbeeld voor ${label}`}
        aria-describedby={`${prefix}-suggestions-hint`}
        value=""
        onChange={(event) => addSuggestion(field, event.target.value)}
      >
        <option value="" disabled>
          Kies voorbeeld…
        </option>
        {CRAVING_SUGGESTIONS[field].map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingCompletion) return;
    if (
      !validDate(value.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    ) {
      showError("Vul een geldige datum tussen 1900 en 2199 en een tijd in.");
      return;
    }
    if (!narrativeFields.some((field) => value[field].trim())) {
      showError(
        "Schrijf iets bij je externe situatie, gedachte, lichamelijke sensatie, emotie of gedrag. Eén van deze tekstvelden is genoeg.",
      );
      return;
    }
    const names = cravingSubstances(value)
      .map((name) => name.trim())
      .filter(Boolean);
    if (
      new Set(names.map((name) => name.toLocaleLowerCase("nl-NL"))).size !==
      names.length
    ) {
      showError(
        "Een middel staat meerdere keren in de lijst. Verwijder de dubbele rij; je andere invoer blijft behouden.",
      );
      return;
    }
    const nextRecord = withCravingSubstances(value, names);
    // This post-save annotation is changed separately. A resumed draft must
    // neither erase a newer annotation nor restore one explicitly removed.
    const currentRecord = state.cravings.find(
      (item) => item.id === nextRecord.id,
    );
    if (currentRecord?.usedAfterCraving === true) {
      nextRecord.usedAfterCraving = true;
      if (currentRecord.usedConfirmedAt !== undefined)
        nextRecord.usedConfirmedAt = currentRecord.usedConfirmedAt;
      else delete nextRecord.usedConfirmedAt;
    } else {
      delete nextRecord.usedAfterCraving;
      delete nextRecord.usedConfirmedAt;
    }
    for (const field of narrativeFields)
      nextRecord[field] = value[field].trim();
    const exists = state.cravings.some((item) => item.id === nextRecord.id);
    const cravings = exists
      ? state.cravings.map((item) =>
          item.id === nextRecord.id ? nextRecord : item,
        )
      : [...state.cravings, nextRecord];
    if (
      onSave(
        { ...state, cravings },
        exists ? "Je craving is bijgewerkt." : "Je craving is opgeslagen.",
      )
    ) {
      setValue(nextRecord);
      setError(null);
      complete("saved");
    } else {
      showError(
        "Opslaan is niet gelukt. Je ingevulde tekst staat hier nog. Probeer het opnieuw.",
      );
    }
  }

  function cancelDelete() {
    setConfirmDelete(false);
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  }

  function remove() {
    if (pendingCompletion) return;
    if (
      onSave(
        {
          ...state,
          cravings: state.cravings.filter((item) => item.id !== value.id),
        },
        "De craving is verwijderd.",
      )
    ) {
      setConfirmDelete(false);
      complete("deleted");
    } else {
      showError("Verwijderen is niet gelukt. Je craving blijft bewaard.");
    }
  }

  if (pendingCompletion) {
    return (
      <article className="dp-form-page anchor-craving">
        <header className="anchor-craving-intro">
          <p className="dp-kicker">Een moment van drang</p>
          <h1 tabIndex={-1}>Nog één stap</h1>
        </header>
        <section className="dp-card dp-form-section">
          <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error?.message}
          </p>
          <button
            type="button"
            className="dp-button primary"
            onClick={() => complete(pendingCompletion)}
          >
            Afronden opnieuw proberen
          </button>
        </section>
      </article>
    );
  }

  return (
    <article className="dp-form-page anchor-craving">
      <a
        className="dp-text-button dp-back"
        href={`#${returnTo}`}
        onClick={(event) => {
          event.preventDefault();
          navigate(returnTo);
        }}
      >
        <span aria-hidden="true">←</span>{" "}
        {returnTo === "/history"
          ? "Terug naar Terugkijken"
          : "Terug naar Vandaag"}
      </a>
      <header className="anchor-craving-intro">
        <p className="dp-kicker">Een moment van drang</p>
        <h1 tabIndex={-1}>{record ? "Je craving" : "Craving vastleggen"}</h1>
        <p className="dp-muted">
          Datum en tijd zijn nodig. Schrijf daarnaast iets bij één van de
          beschrijvende tekstvelden. De andere velden mag je leeg laten.
        </p>
      </header>
      {resumedDraft && (
        <p className="dp-notice" role="status">
          Je werkt verder aan een bewaard concept.{" "}
          {validDate(resumedDraft.date) && resumedDraft.time
            ? `Je tekst en het oorspronkelijke tijdstip zijn behouden: ${dayLabel(resumedDraft.date)} om ${resumedDraft.time}.`
            : "Je tekst en de nog onvolledige datum of tijd zijn teruggezet."}{" "}
          Pas de datum en tijd alleen aan als je een ander moment bedoelt.
        </p>
      )}

      <section
        className="dp-card dp-form-section"
        aria-label="Direct ondersteuning"
      >
        <p>
          Heb je nu steun nodig? Je hoeft deze registratie niet eerst af te
          maken.
        </p>
        <button type="button" className="dp-button" onClick={onSupport}>
          Open mijn houvast
        </button>
      </section>

      <form onSubmit={submit} className="anchor-craving-form">
        <section
          className="dp-card dp-form-section"
          aria-labelledby={`${prefix}-when`}
        >
          <h2 id={`${prefix}-when`}>Wanneer was het?</h2>
          <div className="dp-form-grid anchor-craving-datetime">
            <label className="dp-field" htmlFor={`${prefix}-date`}>
              Datum
              <input
                id={`${prefix}-date`}
                type="date"
                required
                min="1900-01-01"
                max="2199-12-31"
                value={value.date}
                aria-describedby={dateHintId}
                onChange={(event) => update("date", event.target.value)}
              />
            </label>
            <label className="dp-field" htmlFor={`${prefix}-time`}>
              Tijd
              <input
                id={`${prefix}-time`}
                type="time"
                required
                value={value.time}
                onChange={(event) => update("time", event.target.value)}
              />
            </label>
          </div>
          <p id={dateHintId} className="anchor-craving-day">
            {dayLabel(value.date)}
          </p>
          <CravingSubstances
            values={cravingSubstances(value)}
            onChange={updateSubstances}
          />
        </section>

        <section
          className="dp-card dp-form-section"
          aria-labelledby={`${prefix}-situation-title`}
        >
          <h2 id={`${prefix}-situation-title`}>Externe situatie</h2>
          <label className="dp-field" htmlFor={`${prefix}-situation`}>
            <span id={`${prefix}-situation-label`}>Wie, wat en waar</span>
            <span className="dp-hint" id={`${prefix}-situation-hint`}>
              Wie waren erbij, wat gebeurde er en waar was je?
            </span>
            <textarea
              id={`${prefix}-situation`}
              rows={3}
              maxLength={4000}
              value={value.situation}
              aria-labelledby={`${prefix}-situation-label`}
              aria-describedby={`${prefix}-situation-hint`}
              onChange={(event) => update("situation", event.target.value)}
            />
          </label>
        </section>

        <section
          className="dp-card dp-form-section anchor-craving-internal"
          aria-labelledby={`${prefix}-internal-title`}
        >
          <h2 id={`${prefix}-internal-title`}>Interne situatie</h2>
          <p className="dp-muted" id={`${prefix}-suggestions-hint`}>
            Schrijf zelf of kies een voorbeeld. Een keuze voegt tekst toe; je
            kunt alles aanpassen en meerdere voorbeelden kiezen.
          </p>
          <div className="dp-field">
            <label id={`${prefix}-thought-label`} htmlFor={`${prefix}-thought`}>
              Gedachte
            </label>
            <span className="dp-hint" id={`${prefix}-thought-hint`}>
              Wat ging er door je hoofd?
            </span>
            {suggestionPicker("thought", "gedachte")}
            <textarea
              id={`${prefix}-thought`}
              rows={3}
              maxLength={4000}
              value={value.thought}
              aria-labelledby={`${prefix}-thought-label`}
              aria-describedby={`${prefix}-thought-hint`}
              onChange={(event) => update("thought", event.target.value)}
            />
          </div>
          <div className="dp-field">
            <label id={`${prefix}-body-label`} htmlFor={`${prefix}-body`}>
              Lichamelijke sensatie
            </label>
            <span className="dp-hint" id={`${prefix}-body-hint`}>
              Wat voelde je in je lichaam?
            </span>
            {suggestionPicker("bodySensation", "lichamelijke sensatie")}
            <textarea
              id={`${prefix}-body`}
              rows={3}
              maxLength={4000}
              value={value.bodySensation}
              aria-labelledby={`${prefix}-body-label`}
              aria-describedby={`${prefix}-body-hint`}
              onChange={(event) => update("bodySensation", event.target.value)}
            />
          </div>
          <div className="dp-field">
            <label id={`${prefix}-emotion-label`} htmlFor={`${prefix}-emotion`}>
              Emotie
            </label>
            <span className="dp-hint" id={`${prefix}-emotion-hint`}>
              Welke emotie of emoties merkte je?
            </span>
            {suggestionPicker("emotion", "emotie")}
            <textarea
              id={`${prefix}-emotion`}
              rows={3}
              maxLength={4000}
              value={value.emotion}
              aria-labelledby={`${prefix}-emotion-label`}
              aria-describedby={`${prefix}-emotion-hint`}
              onChange={(event) => update("emotion", event.target.value)}
            />
          </div>
        </section>

        <section
          className="dp-card dp-form-section"
          aria-labelledby={`${prefix}-behavior-title`}
        >
          <h2 id={`${prefix}-behavior-title`}>Je gedrag</h2>
          <label className="dp-field" htmlFor={`${prefix}-behavior`}>
            <span id={`${prefix}-behavior-label`}>Gedrag (wat deed je?)</span>
            <span className="dp-hint" id={`${prefix}-behavior-hint`}>
              Beschrijf in je eigen woorden wat je deed.
            </span>
            <textarea
              id={`${prefix}-behavior`}
              rows={3}
              maxLength={4000}
              value={value.behavior}
              aria-labelledby={`${prefix}-behavior-label`}
              aria-describedby={`${prefix}-behavior-hint`}
              onChange={(event) => update("behavior", event.target.value)}
            />
          </label>
        </section>

        {error && (
          <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error.message}
          </p>
        )}
        <div className="anchor-craving-save">
          <p className="dp-muted anchor-craving-save-note">
            Eén beschrijving is genoeg: je externe situatie, gedachte,
            lichamelijke sensatie, emotie of gedrag. Alleen een middel kiezen is
            nog geen beschrijving.
          </p>
          <div className="dp-actions anchor-craving-save-actions">
            <button className="dp-button primary" type="submit">
              {record ? "Wijzigingen opslaan" : "Craving opslaan"}
            </button>
            <a
              className="dp-button quiet"
              href="#/history"
              onClick={(event) => {
                event.preventDefault();
                navigate("/history");
              }}
            >
              Naar Terugkijken
            </a>
          </div>
          <p role="status" className="anchor-craving-save-status">
            {record && !dirty
              ? "Opgeslagen. Je kunt dit moment later weer aanpassen."
              : ""}
          </p>
        </div>
      </form>

      {record && <CravingUseAction record={record} onChange={onUseChange} />}

      {record && (
        <section
          className="anchor-craving-delete"
          aria-label="Craving verwijderen"
        >
          {confirmDelete ? (
            <div
              className="dp-inline-confirm"
              role="alertdialog"
              aria-labelledby={confirmationTitleId}
              aria-describedby={confirmationDescriptionId}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelDelete();
                }
              }}
            >
              <h2 id={confirmationTitleId}>Deze craving verwijderen?</h2>
              <p id={confirmationDescriptionId}>
                Dit verwijdert alleen dit moment. Je kunt dit niet ongedaan
                maken.
              </p>
              <div className="dp-actions">
                <button
                  type="button"
                  className="dp-button"
                  ref={cancelDeleteRef}
                  onClick={cancelDelete}
                >
                  Behouden
                </button>
                <button
                  type="button"
                  className="dp-button anchor-craving-remove"
                  onClick={remove}
                >
                  Ja, verwijderen
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="dp-text-button anchor-craving-remove"
              ref={deleteButtonRef}
              onClick={() => setConfirmDelete(true)}
            >
              Craving verwijderen
            </button>
          )}
        </section>
      )}
    </article>
  );
}
