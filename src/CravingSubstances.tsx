import { useId, useRef, useState } from "react";
import { SUBSTANCE_OPTIONS } from "./lib/substances";

const normalized = (name: string) => name.trim().toLocaleLowerCase("nl-NL");
const isCustom = (name: string) =>
  !!name && !SUBSTANCE_OPTIONS.some((option) => option === name);

export function CravingSubstances({
  values,
  onChange,
}: {
  values: string[];
  onChange: (names: string[]) => void;
}) {
  const names = values.length ? values : [""];
  const [rows, setRows] = useState(() =>
    names.map((name) => ({ id: crypto.randomUUID(), custom: isCustom(name) })),
  );
  const prefix = useId();
  const selects = useRef(new Map<string, HTMLSelectElement>());
  const inputs = useRef(new Map<string, HTMLInputElement>());

  function update(index: number, name: string) {
    onChange(names.map((value, i) => (i === index ? name : value)));
  }

  function choose(index: number, choice: string) {
    const row = rows[index];
    const custom = choice === "__custom__";
    setRows(rows.map((item, i) => (i === index ? { ...item, custom } : item)));
    if (!custom) update(index, choice);
    else {
      if (!row.custom) update(index, "");
      requestAnimationFrame(() => inputs.current.get(row.id)?.focus());
    }
  }

  function add() {
    const row = { id: crypto.randomUUID(), custom: false };
    setRows([...rows, row]);
    onChange([...names, ""]);
    requestAnimationFrame(() => selects.current.get(row.id)?.focus());
  }

  function remove(index: number) {
    const nextRows = rows.filter((_, i) => i !== index);
    setRows(nextRows);
    onChange(names.filter((_, i) => i !== index));
    const target = nextRows[Math.min(index, nextRows.length - 1)];
    requestAnimationFrame(() => selects.current.get(target.id)?.focus());
  }

  return (
    <div
      className="anchor-craving-substances"
      role="group"
      aria-label="Middelen bij deze craving"
    >
      <p className="dp-hint" id={`${prefix}-hint`}>
        Optioneel. Je kunt meerdere middelen of gedragingen kiezen.
      </p>
      {rows.map((row, index) => {
        const name = names[index] ?? "";
        const duplicate =
          !!normalized(name) &&
          names.some(
            (other, i) => i !== index && normalized(other) === normalized(name),
          );
        const message = duplicate
          ? "Dit middel staat al in een andere rij. Kies een ander middel of verwijder deze rij."
          : "";
        const suffix = index ? ` ${index + 1}` : "";
        const id = `${prefix}-${row.id}`;
        return (
          <div className="anchor-substance-row" key={row.id}>
            <label className="dp-field" htmlFor={`${id}-choice`}>
              <span id={`${id}-label`}>Middel of gedrag{suffix}</span>
              <select
                id={`${id}-choice`}
                aria-labelledby={`${id}-label`}
                aria-describedby={`${prefix}-hint${duplicate ? ` ${id}-error` : ""}`}
                aria-invalid={duplicate || undefined}
                ref={(element) => {
                  if (element) {
                    selects.current.set(row.id, element);
                    element.setCustomValidity(message);
                  } else selects.current.delete(row.id);
                }}
                value={row.custom ? "__custom__" : name}
                onChange={(event) => choose(index, event.target.value)}
              >
                <option value="">Niet ingevuld</option>
                {SUBSTANCE_OPTIONS.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={
                      normalized(option) !== normalized(name) &&
                      names.some(
                        (other, i) =>
                          i !== index &&
                          normalized(other) === normalized(option),
                      )
                    }
                  >
                    {option}
                  </option>
                ))}
                <option value="__custom__">Ander middel of gedrag</option>
              </select>
            </label>
            {row.custom && (
              <label className="dp-field" htmlFor={`${id}-name`}>
                Naam van middel of gedrag{suffix}
                <input
                  id={`${id}-name`}
                  type="text"
                  maxLength={120}
                  aria-invalid={duplicate || undefined}
                  aria-describedby={duplicate ? `${id}-error` : undefined}
                  ref={(element) => {
                    if (element) {
                      inputs.current.set(row.id, element);
                      element.setCustomValidity(message);
                    } else inputs.current.delete(row.id);
                  }}
                  value={name}
                  onChange={(event) => update(index, event.target.value)}
                />
              </label>
            )}
            {duplicate && (
              <p className="dp-error" role="alert" id={`${id}-error`}>
                {message}
              </p>
            )}
            {rows.length > 1 && (
              <button
                type="button"
                className="dp-text-button"
                onClick={() => remove(index)}
                aria-label={`Middel ${index + 1} verwijderen${name.trim() ? `: ${name.trim()}` : ""}`}
              >
                Middel verwijderen
              </button>
            )}
          </div>
        );
      })}
      {rows.length < 20 ? (
        <button type="button" className="dp-button" onClick={add}>
          Nog een middel toevoegen
        </button>
      ) : (
        <p className="dp-hint">
          Je kunt maximaal 20 middelen of gedragingen per registratie kiezen.
        </p>
      )}
    </div>
  );
}
