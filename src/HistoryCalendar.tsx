import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildHistoryCalendar, shiftHistoryMonth } from "./lib/historyCalendar";
import type { AppState } from "./lib/storage";
import "./history-calendar.css";

const weekdays = [
  ["ma", "maandag"],
  ["di", "dinsdag"],
  ["wo", "woensdag"],
  ["do", "donderdag"],
  ["vr", "vrijdag"],
  ["za", "zaterdag"],
  ["zo", "zondag"],
] as const;

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
}

function formatDate(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function moveDays(date: string, offset: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + offset);
  if (next.getFullYear() < 1900 || next.getFullYear() > 2199) return null;
  return formatDate(next);
}

function moveMonths(date: string, offset: number) {
  const nextMonth = shiftHistoryMonth(date.slice(0, 7), offset);
  if (!nextMonth) return null;
  const lastDay = new Date(`${nextMonth}-01T12:00:00`);
  lastDay.setMonth(lastDay.getMonth() + 1, 0);
  return `${nextMonth}-${String(Math.min(Number(date.slice(8, 10)), lastDay.getDate())).padStart(2, "0")}`;
}

function preferredDate(month: string, selected: string | null, today: string) {
  if (selected?.slice(0, 7) === month) return selected;
  return today.slice(0, 7) === month ? today : `${month}-01`;
}

export function HistoryCalendar({
  state,
  today,
  month,
  selectedDate,
  onMonthChange,
  onSelectDate,
}: {
  state: AppState;
  today: string;
  month: string;
  selectedDate: string | null;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const calendar = useMemo(
    () => buildHistoryCalendar(state, month),
    [state, month],
  );
  const titleId = useId();
  const [cursor, setCursor] = useState(() =>
    preferredDate(month, selectedDate, today),
  );
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const keyboardTarget = useRef<string | null>(null);
  const previous = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const weeks = Array.from({ length: calendar.days.length / 7 }, (_, index) =>
    calendar.days.slice(index * 7, index * 7 + 7),
  );

  useEffect(() => {
    const target =
      keyboardTarget.current || preferredDate(month, selectedDate, today);
    setCursor(target);
    if (keyboardTarget.current && target.slice(0, 7) === month) {
      keyboardTarget.current = null;
      requestAnimationFrame(() => buttons.current.get(target)?.focus());
    }
  }, [month, selectedDate, today]);

  function browse(
    value: string | null,
    control: "previous" | "next" | "today",
  ) {
    if (!value) return;
    keyboardTarget.current = null;
    onMonthChange(value);
    requestAnimationFrame(() => {
      // A boundary month can disable the control that was just activated.
      // Keep keyboard focus on the remaining month control in that case.
      if (control === "previous" && previous.current?.disabled)
        next.current?.focus();
      else if (control === "next" && next.current?.disabled)
        previous.current?.focus();
      else if (control === "today") next.current?.focus();
    });
  }

  function focusDate(date: string) {
    setCursor(date);
    if (date.slice(0, 7) !== month) {
      keyboardTarget.current = date;
      onMonthChange(date.slice(0, 7));
    } else requestAnimationFrame(() => buttons.current.get(date)?.focus());
  }

  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let target: string | null = null;
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        target = moveDays(date, -1);
        break;
      case "ArrowRight":
        target = moveDays(date, 1);
        break;
      case "ArrowUp":
        target = moveDays(date, -7);
        break;
      case "ArrowDown":
        target = moveDays(date, 7);
        break;
      case "Home":
        target = moveDays(date, -weekday);
        break;
      case "End":
        target = moveDays(date, 6 - weekday);
        break;
      case "PageUp":
        target = moveMonths(date, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        target = moveMonths(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target) focusDate(target);
  }

  return (
    <section className="dp-card dp-history-calendar" aria-label="Maandkalender">
      <div className="dp-calendar-intro">
        <h2>Kalender</h2>
        <p className="dp-muted">Kies een dag om je momenten terug te zien.</p>
      </div>
      <div className="dp-calendar-header">
        <h3 id={titleId} aria-live="polite" aria-atomic="true">
          {monthLabel(month)}
        </h3>
        <div className="dp-calendar-navigation">
          <button
            ref={previous}
            type="button"
            className="dp-calendar-month-button"
            aria-label="Vorige maand"
            disabled={!calendar.previousMonth}
            onClick={() => browse(calendar.previousMonth, "previous")}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            ref={next}
            type="button"
            className="dp-calendar-month-button"
            aria-label="Volgende maand"
            disabled={!calendar.nextMonth}
            onClick={() => browse(calendar.nextMonth, "next")}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p id={`${titleId}-keys`} className="dp-visually-hidden">
        Met de pijltjestoetsen verplaats je de focus. Druk op Enter om een dag
        te openen. Page Up en Page Down gaan naar een andere maand.
      </p>
      <table
        className="dp-calendar-grid"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-keys`}
      >
        <thead>
          <tr>
            {weekdays.map(([short, full]) => (
              <th scope="col" key={short}>
                <abbr title={full}>{short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}>
              {week.map((cell, column) => (
                <td key={cell.date || `blank-${column}`}>
                  {cell.date && cell.inMonth && (
                    <button
                      ref={(button) => {
                        if (button) buttons.current.set(cell.date!, button);
                        else buttons.current.delete(cell.date!);
                      }}
                      type="button"
                      className="dp-calendar-day"
                      data-calendar-date={cell.date}
                      data-calendar-records={cell.total}
                      aria-label={`${dateLabel(cell.date)}. ${cell.total} ${cell.total === 1 ? "registratie" : "registraties"}.${cell.date === today ? " Vandaag." : ""}${cell.date === selectedDate ? " Geselecteerd." : ""}`}
                      aria-pressed={cell.date === selectedDate}
                      aria-current={cell.date === today ? "date" : undefined}
                      tabIndex={cell.date === cursor ? 0 : -1}
                      onFocus={() => setCursor(cell.date!)}
                      onKeyDown={(event) => dayKey(event, cell.date!)}
                      onClick={() => onSelectDate(cell.date!)}
                    >
                      {cell.day}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dp-calendar-footer">
        <p className="dp-muted dp-calendar-legend">
          <i className="dp-calendar-marker" aria-hidden="true" />
          Markering = iets vastgelegd
        </p>
        {month !== today.slice(0, 7) && (
          <button
            type="button"
            className="dp-button quiet"
            onClick={() => browse(today.slice(0, 7), "today")}
          >
            Deze maand
          </button>
        )}
      </div>
    </section>
  );
}
