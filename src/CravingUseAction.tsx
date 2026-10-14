import { useId, useRef, useState } from "react";
import type { CravingRecord } from "./lib/storage";
import "./craving-use.css";

export function CravingUseAction({
  record,
  onChange,
  disabled = false,
}: {
  record: CravingRecord;
  onChange: (id: string, used: boolean) => boolean;
  disabled?: boolean;
}) {
  const used = record.usedAfterCraving === true;
  const hintId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  function change() {
    if (disabled) return;
    setError("");
    setFeedback("");
    if (!onChange(record.id, !used)) {
      setError(
        "De markering is niet gewijzigd. Probeer het opnieuw; je craving blijft bewaard.",
      );
      return;
    }
    setFeedback(used ? "Markering verwijderd." : "Markering opgeslagen.");
    // Keep one control when the label changes, including keyboard and Safari use.
    requestAnimationFrame(() =>
      buttonRef.current?.focus({ preventScroll: true }),
    );
  }

  return (
    <div
      className="dp-craving-use"
      role="group"
      aria-label="Gebruik na craving"
    >
      {!used && (
        <p className="dp-muted dp-craving-use-hint" id={hintId}>
          Je kunt later aangeven of je na deze craving hebt gebruikt.
        </p>
      )}
      <div className="dp-craving-use-actions">
        {used && <span className="dp-craving-use-badge">Gebruikt</span>}
        <button
          ref={buttonRef}
          type="button"
          className="dp-button quiet"
          disabled={disabled}
          aria-describedby={used ? undefined : hintId}
          onClick={change}
        >
          {used ? "Markering verwijderen" : "Gebruikt aangeven"}
        </button>
      </div>
      {error && (
        <p className="dp-error" role="alert">
          {error}
        </p>
      )}
      <p className="dp-muted dp-craving-use-feedback" role="status">
        {feedback}
      </p>
    </div>
  );
}
