import { phaseDescription, phaseTone, uiStatus } from "../lib/workflow";

export function PhaseBanner({
  phase,
  executionStatus,
  waiting = false,
  refreshing = false,
  onRefresh,
}: {
  phase: string;
  executionStatus?: string;
  waiting?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  if (!phase) {
    return null;
  }
  return (
    <div className={`phase-card tone-${phaseTone(phase)}`}>
      {waiting ? <span className="spinner" aria-hidden="true" /> : null}
      <span className={`phase-chip tone-${phaseTone(phase)}`}>
        {uiStatus(phase, executionStatus ?? "")}
      </span>
      <p>{phaseDescription(phase, executionStatus ?? "")}</p>
      {onRefresh ? (
        <button
          type="button"
          className="btn"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      ) : null}
    </div>
  );
}
