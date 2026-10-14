import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog } from "./Dialog";
import { EMOTION_GROUPS } from "./lib/emotions";
import { EMOTION_MEANINGS } from "./lib/emotionMeanings";
import "./emotion-glossary.css";

function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("nl-NL")
    .trim();
}

function Meanings({ words }: { words: readonly string[] }) {
  return (
    <dl className="dp-emotion-meanings">
      {words.map((word) => (
        <div key={word}>
          <dt>{word}</dt>
          <dd>{EMOTION_MEANINGS[word]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmotionGlossary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const term = searchText(query);
  const groups = EMOTION_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((word) =>
      searchText(`${word} ${EMOTION_MEANINGS[word]}`).includes(term),
    ),
  })).filter((group) => group.options.length);
  const count = groups.reduce(
    (total, group) => total + group.options.length,
    0,
  );
  return (
    <Dialog title="Emoties en betekenissen" onClose={onClose}>
      <div className="dp-emotion-glossary">
        <p className="dp-muted" id={helpId}>
          Gevoelens kunnen overlappen en voor iedereen anders aanvoelen. Deze
          korte uitleg helpt je woorden te vinden. Je eigen omschrijving blijft
          altijd mogelijk bij het registreren.
        </p>
        <label className="dp-field">
          Zoek een emotie of betekenis
          <input
            ref={search}
            type="search"
            value={query}
            maxLength={150}
            aria-describedby={helpId}
            placeholder="Bijvoorbeeld nerveus of verbinding"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="dp-glossary-search-status">
          <p className="dp-muted" role="status" aria-atomic="true">
            {term
              ? `${count} ${count === 1 ? "gevoelswoord" : "gevoelswoorden"} gevonden`
              : `${count} gevoelswoorden · ${groups.length} groepen`}
          </p>
          {query && (
            <button
              type="button"
              className="dp-button quiet"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              Zoekopdracht wissen
            </button>
          )}
        </div>
        {!count && (
          <div className="dp-empty-inline">
            <h3>Geen emoties gevonden.</h3>
            <p>Probeer een ander woord of wis je zoekopdracht.</p>
          </div>
        )}
        <div className="dp-glossary-groups">
          {groups.map((group) =>
            term ? (
              <section className="dp-glossary-group" key={group.label}>
                <h3>{group.label}</h3>
                <Meanings words={group.options} />
              </section>
            ) : (
              <details className="dp-glossary-group" key={group.label}>
                <summary>
                  <span>{group.label}</span>
                  <span className="dp-glossary-count">
                    <span aria-hidden="true">{group.options.length}</span>
                    <span className="dp-visually-hidden">
                      {group.options.length} gevoelswoorden
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </summary>
                <Meanings words={group.options} />
              </details>
            ),
          )}
        </div>
      </div>
    </Dialog>
  );
}
