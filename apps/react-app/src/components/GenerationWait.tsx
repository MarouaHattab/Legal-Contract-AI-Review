import { GENERATING_PHASES } from "../lib/workflow";

export function isGeneratingPhase(phase: string): boolean {
  return GENERATING_PHASES.has(phase) || !phase;
}

export function GenerationWait({
  phase,
  intervalSeconds,
  refreshing,
  onRefresh,
  hasFindings = false,
  hasReport = false,
}: {
  phase: string;
  intervalSeconds: number;
  refreshing: boolean;
  onRefresh: () => void;
  hasFindings?: boolean;
  hasReport?: boolean;
}) {
  const waiting = isGeneratingPhase(phase) && !hasReport;
  if (!waiting) {
    return null;
  }

  const copy = waitCopy(phase, hasFindings, hasReport);
  return (
    <div className="wait-card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
        <p className="muted">
          Checks FastAPI every {intervalSeconds} seconds. The page does not
          reload.
        </p>
      </div>
      <button
        type="button"
        className="btn"
        disabled={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? "Refreshing…" : "Refresh now"}
      </button>
    </div>
  );
}

export function WaitingSection({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <article className="result-card wait">
      <p className="caption">{label}</p>
      <div className="wait-inline">
        <span className="spinner" aria-hidden="true" />
        <p>{detail}</p>
      </div>
    </article>
  );
}

export function FindingsPlaceholder() {
  return (
    <section className="result-section">
      <div className="result-section-head">
        <div>
          <h3>Document summary</h3>
          <p className="muted">
            The language model is still writing this document’s summary and
            risks.
          </p>
        </div>
      </div>
      <div className="finding-list">
        <WaitingSection
          label="Summary"
          detail="Waiting for the LLM to generate the document summary."
        />
        <WaitingSection
          label="Risks"
          detail="Waiting for the LLM to generate the document risks."
        />
      </div>
    </section>
  );
}

export function ReportPlaceholder() {
  return (
    <section className="result-section">
      <div className="result-section-head">
        <h3>Current report</h3>
      </div>
      <div className="report-grid">
        <WaitingSection
          label="Overall risk"
          detail="Waiting for the LLM to generate the overall risk."
        />
        <WaitingSection
          label="Recommendations"
          detail="Waiting for the LLM to generate recommendations."
        />
        <div className="wide">
          <WaitingSection
            label="Cross-contract risks"
            detail="Waiting for the LLM to generate cross-contract risks."
          />
        </div>
      </div>
    </section>
  );
}

function waitCopy(
  phase: string,
  hasFindings: boolean,
  hasReport: boolean,
): { title: string; body: string } {
  if (phase === "revising") {
    return {
      title: "Waiting for a new generation",
      body: "The language model is writing a revised report from the feedback that was sent.",
    };
  }
  if (phase === "analyzing" || (hasFindings && !hasReport)) {
    return {
      title: "Waiting for the report",
      body: "Document summaries are ready. The language model is still writing the consolidated report.",
    };
  }
  if (phase === "extracting") {
    return {
      title: "Waiting for summaries and risks",
      body: "The language model is generating document summaries and risks from the Markdown already produced.",
    };
  }
  return {
    title: "Waiting for Temporal",
    body: "Loading the latest contract-review status from FastAPI.",
  };
}
