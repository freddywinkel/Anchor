import { useId, useRef, useState } from "react";
import { LinkedCravingCheckin } from "./CravingCheckins";
import { cravingSubstances } from "./lib/substances";
import type { AppState, Moment } from "./lib/storage";
import "./history-linked-checkins.css";

export function HistoryLinkedCheckins({ moments }: { moments: Moment[] }) {
  const [visibleCount, setVisibleCount] = useState(10);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  if (!moments.length) return null;
  const visible = moments.slice(0, visibleCount);

  return (
    <section aria-label="Gekoppelde check-ins" className="dp-linked-history">
      <h3>Gekoppelde check-ins ({moments.length})</h3>
      <ul id={listId} ref={listRef} className="dp-linked-history-list">
        {visible.map((moment, index) => (
          <li
            key={moment.id}
            data-linked-history-id={moment.id}
            tabIndex={-1}
            aria-label={`Gekoppelde check-in ${index + 1} van ${moments.length}`}
          >
            <LinkedCravingCheckin moment={moment} />
          </li>
        ))}
      </ul>
      <p
        className="dp-muted"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Je ziet {visible.length} van {moments.length} gekoppelde check-ins.
      </p>
      {visible.length < moments.length && (
        <button
          type="button"
          className="dp-button"
          aria-controls={listId}
          onClick={() => {
            const firstAdded = visible.length;
            setVisibleCount((current) =>
              Math.min(current + 10, moments.length),
            );
            requestAnimationFrame(() =>
              (
                listRef.current?.children[firstAdded] as HTMLElement | undefined
              )?.focus(),
            );
          }}
        >
          Meer gekoppelde check-ins
        </button>
      )}
    </section>
  );
}

export function HistoryCravingContext({
  state,
  moment,
}: {
  state: AppState;
  moment: Moment;
}) {
  if (!moment.cravingId) return null;
  const craving = state.cravings.find((item) => item.id === moment.cravingId);
  let description =
    "De gekoppelde craving is niet meer beschikbaar. Deze check-in blijft bewaard.";
  if (craving) {
    const date = new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${craving.date}T12:00:00`));
    const substances = cravingSubstances(craving);
    description = `${date} · ${craving.time}${substances.length ? ` · ${substances.join(", ")}` : ""}`;
  }
  return (
    <dl className="dp-history-fields">
      <div>
        <dt>Gekoppelde craving</dt>
        <dd>{description}</dd>
      </div>
    </dl>
  );
}
