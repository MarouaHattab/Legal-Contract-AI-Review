export function StepActions({
  backLabel = "Back",
  continueLabel = "Next",
  continueEnabled = true,
  showBack = true,
  note,
  resetLabel,
  onBack,
  onContinue,
  onReset,
  busy = false,
}: {
  backLabel?: string;
  continueLabel?: string;
  continueEnabled?: boolean;
  showBack?: boolean;
  note?: string;
  resetLabel?: string;
  onBack?: () => void;
  onContinue?: () => void;
  onReset?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="actions">
      <div className="actions-left">
        {note ? <span>{note}</span> : null}
        {showBack && onBack ? (
          <button type="button" className="btn" onClick={onBack} disabled={busy}>
            {backLabel}
          </button>
        ) : null}
        {onReset ? (
          <button
            type="button"
            className="btn ghost"
            onClick={onReset}
            disabled={busy}
          >
            {resetLabel ?? "Start over"}
          </button>
        ) : null}
      </div>
      {onContinue ? (
        <button
          type="button"
          className="btn primary"
          onClick={onContinue}
          disabled={!continueEnabled || busy}
        >
          {continueLabel}
        </button>
      ) : null}
    </div>
  );
}
