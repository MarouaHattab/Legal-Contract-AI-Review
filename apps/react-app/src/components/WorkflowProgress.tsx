import {
  GENERATING_PHASES,
  contractProgress,
  phaseDescription,
  phaseTone,
} from "../lib/workflow";

const STAGES = ["Document findings", "Consolidated report", "Human review"];

export function WorkflowProgress({
  phase,
  intervalSeconds,
  refreshing,
  onRefresh,
}: {
  phase: string;
  intervalSeconds: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const progress = contractProgress(phase);
  const working = !phase || GENERATING_PHASES.has(phase);
  const description = phaseDescription(
    phase,
    "Loading the latest contract-review state from FastAPI.",
  );

  return (
    <section
      className={`workflow-progress tone-${phaseTone(phase)}`}
      role="status"
      aria-live="polite"
    >
      <div className="workflow-progress-head">
        {working ? <span className="spinner" aria-hidden="true" /> : null}
        <div>
          <p className="eyebrow">Evidence workflow</p>
          <h3>{progress.title}</h3>
          <p>{description}</p>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh status"}
        </button>
      </div>
      <ol className="evidence-rail">
        {STAGES.map((stage, index) => {
          const state =
            index < progress.activeIndex
              ? "done"
              : index === progress.activeIndex
                ? "current"
                : "upcoming";
          return (
            <li key={stage} className={state}>
              <span>{index + 1}</span>
              <strong>{stage}</strong>
            </li>
          );
        })}
      </ol>
      {working ? (
        <p className="workflow-progress-note">
          Status checks continue every {intervalSeconds} seconds without
          reloading this page.
        </p>
      ) : null}
    </section>
  );
}
