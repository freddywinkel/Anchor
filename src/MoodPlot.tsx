import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MOODS } from "./RatingsEditor";
import "./mood-plot.css";

export type MoodObservation = {
  id: string;
  date: string;
  time: string;
  mood: number;
  label: string;
};

const score = (value: number) => (value > 0 ? `+${value}` : String(value));
const moodName = (value: number) => `${MOODS[value + 2]} (${score(value)})`;
function dateLabel(date: string, short = false) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

/** A read-only view of individual scores; the horizontal axis is record order. */
export function MoodPlot({
  observations,
}: {
  observations: MoodObservation[];
}) {
  const points = observations.slice(-40);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = points.findIndex((point) => point.id === selectedId);
  const activeIndex = selectedIndex < 0 ? points.length - 1 : selectedIndex;
  const selected = points[activeIndex];
  const plot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 240 });
  const prefix = useId();

  useLayoutEffect(() => {
    const element = plot.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width && height)
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [points.length > 0]);

  const inset = 18;
  const x = (index: number) =>
    points.length === 1
      ? size.width / 2
      : inset + (index / (points.length - 1)) * (size.width - inset * 2);
  const y = (value: number) =>
    inset + ((2 - value) / 4) * (size.height - inset * 2);
  const choose = (index: number) => {
    if (points[index]) setSelectedId(points[index].id);
  };

  return (
    <section
      className="dp-mood-plot dp-card"
      aria-labelledby={`${prefix}-title`}
    >
      <header className="anchor-mood-heading">
        <div>
          <p className="dp-kicker">Jouw momenten</p>
          <h2 id={`${prefix}-title`}>Stemming per moment</h2>
          <p className="dp-muted">
            Zoals je die op dat moment noteerde. Je dagsamenvatting blijft
            apart.
          </p>
        </div>
        <span className="anchor-mood-count">
          {observations.length}{" "}
          {observations.length === 1 ? "meting" : "metingen"}
        </span>
      </header>
      {selected ? (
        <>
          <div className="anchor-mood-legend" aria-label="Soorten metingen">
            <span>
              <i aria-hidden="true" /> Check-in
            </span>
            <span>
              <i className="is-after" aria-hidden="true" /> Nameting
            </span>
          </div>
          <div className="anchor-mood-chart">
            <div className="anchor-mood-axis" aria-hidden="true">
              {[2, 1, 0, -1, -2].map((value) => (
                <span key={value}>
                  <span className="anchor-mood-axis-word">
                    {MOODS[value + 2]}
                  </span>
                  <span>{score(value)}</span>
                </span>
              ))}
            </div>
            <div className="anchor-mood-canvas" ref={plot}>
              <svg
                className="anchor-mood-svg"
                viewBox={`0 0 ${size.width} ${size.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${points.length} stemmingsmetingen in volgorde. De waarden staan in de uitklapbare lijst hieronder.`}
                aria-describedby={`${prefix}-order`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const clickX = event.clientX - rect.left;
                  const clickY = event.clientY - rect.top;
                  // Closely spaced points can overlap. Pick the closest centre,
                  // rather than whichever SVG element happens to be on top.
                  let nearest = 0;
                  let distance = Infinity;
                  points.forEach((point, index) => {
                    const next =
                      (x(index) - clickX) ** 2 + (y(point.mood) - clickY) ** 2;
                    if (next < distance) {
                      nearest = index;
                      distance = next;
                    }
                  });
                  choose(nearest);
                }}
              >
                {[2, 1, 0, -1, -2].map((value) => (
                  <line
                    key={value}
                    x1="0"
                    x2={size.width}
                    y1={y(value)}
                    y2={y(value)}
                    className={`anchor-mood-guide${value === 0 ? " is-neutral" : ""}`}
                  />
                ))}
                <line
                  x1={x(activeIndex)}
                  x2={x(activeIndex)}
                  y1={inset}
                  y2={size.height - inset}
                  className="anchor-mood-selection-guide"
                />
                <rect
                  x={x(activeIndex) - 13}
                  y={y(selected.mood) - 13}
                  width="26"
                  height="26"
                  rx="13"
                  className="anchor-mood-selection-ring"
                />
                {points.map((point, index) => (
                  <circle
                    key={point.id}
                    cx={x(index)}
                    cy={y(point.mood)}
                    r={index === activeIndex ? 6 : 5}
                    data-mood-point={point.id}
                    className={`anchor-mood-point${point.label === "Nameting" ? " is-after" : ""}${index === activeIndex ? " is-selected" : ""}`}
                  >
                    <title>
                      {dateLabel(point.date)} {point.time} · {point.label} ·
                      stemming {moodName(point.mood)}
                    </title>
                  </circle>
                ))}
              </svg>
            </div>
          </div>
          <div className="anchor-mood-dates">
            <span>{dateLabel(points[0].date, true)}</span>
            {points.length > 1 && (
              <span>{dateLabel(points[points.length - 1].date, true)}</span>
            )}
          </div>
          <p className="anchor-mood-order" id={`${prefix}-order`}>
            Van links naar rechts: volgorde van datum en tijd. Afstanden tonen
            geen tijdsduur.
          </p>
          <div className="anchor-mood-selected">
            <div
              className="anchor-mood-selection-copy"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="anchor-mood-selection-kind">
                {selected.label} · {selected.time}
              </span>
              <strong>{moodName(selected.mood)}</strong>
              <span>{dateLabel(selected.date)}</span>
              <small>
                Meting {observations.length - points.length + activeIndex + 1}{" "}
                van {observations.length}
              </small>
            </div>
            <div
              className="anchor-mood-controls"
              role="group"
              aria-label="Meting bekijken"
            >
              <button
                type="button"
                aria-label="Vorige meting"
                disabled={activeIndex === 0}
                onClick={() => choose(activeIndex - 1)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Volgende meting"
                disabled={activeIndex === points.length - 1}
                onClick={() => choose(activeIndex + 1)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="anchor-mood-interaction">
            Kies een punt of blader met de pijlen.
          </p>
          <details className="dp-observation-details anchor-mood-details">
            <summary>Scores bekijken als tekst ({points.length})</summary>
            <ul>
              {points.map((point) => (
                <li key={point.id}>
                  <span>
                    {dateLabel(point.date)} · {point.time} · {point.label}
                  </span>
                  <strong>Stemming {moodName(point.mood)}</strong>
                </li>
              ))}
            </ul>
          </details>
          {observations.length > 40 && (
            <p className="anchor-mood-note">
              De grafiek en tekstlijst tonen de laatste 40 van{" "}
              {observations.length} metingen binnen je selectie. Oudere metingen
              kun je via de registraties openen.
            </p>
          )}
          <p className="anchor-mood-note">
            Alleen ingevulde stemmingsscores worden getoond. Deze observaties
            laten niet zien waardoor je stemming veranderde.
          </p>
        </>
      ) : (
        <p className="dp-empty-inline anchor-mood-empty">
          Geen stemmingsscores gevonden binnen deze selectie. Je registraties
          blijven beschikbaar in het overzicht.
        </p>
      )}
    </section>
  );
}
