import { useState } from "react";
import { api } from "../api/client";
import { APIError } from "../api/errors";
import type {
  ContractReportQuery,
  ContractReviewResult,
  ContractWorkflowStatus,
} from "../api/types";
import { DocumentFindings } from "../components/DocumentFindings";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  FindingsPlaceholder,
  GenerationWait,
  ReportPlaceholder,
} from "../components/GenerationWait";
import { PhaseBanner } from "../components/PhaseBanner";
import { LiveOrFinalReport, TerminalBanner } from "../components/ReportView";
import { StepActions } from "../components/StepActions";
import { StepFrame } from "../components/StepFrame";
import { usePoll } from "../hooks/usePoll";
import { submissionFingerprint } from "../lib/fingerprint";
import { useStore } from "../state/store";

export function DecisionStep({ onBack }: { onBack?: () => void }) {
  const {
    state,
    setFlash,
    setNotice,
    setLastRevisionFeedback,
    setLastReviewSubmission,
    setLatestRevision,
    setDisplayedRevision,
    setReviewStep,
  } = useStore();
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<ContractWorkflowStatus | null>(null);
  const [report, setReport] = useState<ContractReportQuery | null>(null);
  const [result, setResult] = useState<ContractReviewResult | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const contractId = state.contractWorkflowId;
  const revising = status?.phase === "revising";

  const { refresh, refreshing } = usePoll(
    async () => {
      if (!contractId) {
        return;
      }
      try {
        const latest = await api.getContractStatus(contractId);
        setStatus(latest);
        setLatestRevision(latest.current_revision);
        setReviewerName((current) => current || latest.reviewer);
        setError(null);
        if (latest.phase === "revising") {
          setReport(null);
          setResult(null);
          return;
        }
        if (latest.phase === "awaiting_review") {
          const live = await api.getContractReport(contractId);
          if (live.current_revision !== latest.current_revision) {
            setNotice({
              level: "warning",
              message:
                "The review state changed. The latest report and revision have been reloaded; review them before submitting another decision.",
            });
          }
          setDisplayedRevision(live.current_revision);
          setReport(live);
          setResult(null);
          return;
        }
        if (latest.result_available) {
          setResult(await api.getContractResult(contractId));
          setReport(null);
        }
      } catch (err) {
        if (err instanceof APIError && err.kind === "conflict") {
          setNotice({
            level: "warning",
            message:
              "The review state changed. The latest report and revision have been reloaded; review them before submitting another decision.",
          });
          return;
        }
        setError(err);
      }
    },
    {
      enabled: Boolean(contractId),
      intervalMs: state.pollIntervalSeconds * 1000,
    },
  );

  async function assignReviewer() {
    if (!contractId) {
      return;
    }
    const name = reviewerName.trim();
    if (!name) {
      setError(new Error("Enter a reviewer name."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.assignReviewer(contractId, name);
      setNotice({ level: "success", message: response.message });
      const latest = await api.getContractStatus(contractId);
      setStatus(latest);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision(decision: "approve" | "revise") {
    if (!contractId || !status) {
      return;
    }
    const normalized = feedback.trim();
    if (decision === "revise" && !normalized) {
      setError(new Error("Feedback is required when requesting a revision."));
      return;
    }
    const token = await submissionFingerprint("review", {
      workflow_id: contractId,
      decision,
      expected_revision: status.current_revision,
      feedback: normalized,
    });
    if (state.lastReviewSubmission === token) {
      setError(
        new Error("This review action was already submitted in this browser session."),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const latest = await api.getContractStatus(contractId);
      if (
        latest.phase !== "awaiting_review" ||
        latest.current_revision !== status.current_revision
      ) {
        setLatestRevision(latest.current_revision);
        setDisplayedRevision(latest.current_revision);
        setStatus(latest);
        setNotice({
          level: "warning",
          message:
            "The review state changed. The latest report and revision have been reloaded; review them before submitting another decision.",
        });
        return;
      }
      const response = await api.submitReview(contractId, {
        decision,
        expected_revision: status.current_revision,
        feedback: normalized,
      });
      setLastReviewSubmission(token);
      setFlash(response.message);
      if (decision === "revise") {
        setLastRevisionFeedback(normalized);
        setReviewStep("decision");
      }
      const after = await api.getContractStatus(contractId);
      setStatus(after);
    } catch (err) {
      if (err instanceof APIError && err.kind === "conflict") {
        setNotice({
          level: "warning",
          message:
            "The review state changed. The latest report and revision have been reloaded; review them before submitting another decision.",
        });
        return;
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const phase = status?.phase ?? "";
  const title =
    phase === "revising"
      ? "Waiting for revision"
      : phase === "approved"
        ? "Review complete"
        : "Review";
  const description =
    phase === "revising"
      ? "Your feedback was sent. This page stays on Review until the new report is ready."
      : phase === "approved"
        ? "The assigned reviewer approved the report."
        : "Approve the current report or send feedback. Document summaries stay on the Summary step.";

  if (!contractId) {
    return (
      <StepFrame
        icon="decision"
        title={title}
        description="The summary step must finish before human review."
        footer={
          <StepActions showBack={Boolean(onBack)} onBack={onBack} />
        }
      >
        <p className="muted">Go back to Summary when that step is unlocked.</p>
      </StepFrame>
    );
  }

  const reviewer = status?.reviewer || reviewerName.trim();

  return (
    <StepFrame
      icon="decision"
      title={title}
      description={description}
      footer={
        phase !== "revising" ? (
          <StepActions showBack={Boolean(onBack)} onBack={onBack} />
        ) : undefined
      }
    >
      <ErrorBanner error={error} />
      {status ? (
        <PhaseBanner
          phase={status.phase}
          executionStatus={status.execution_status}
          waiting={["extracting", "analyzing", "revising"].includes(status.phase)}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      ) : (
        <p className="muted">Loading review state from FastAPI.</p>
      )}
      <GenerationWait
        phase={phase}
        intervalSeconds={state.pollIntervalSeconds}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        hasReport={Boolean(report?.report || result?.report)}
      />
      {revising ? (
        <>
          <div className="banner">
            Stay on this page. The revised report will appear here when Temporal
            finishes.
          </div>
          {state.lastRevisionFeedback ? (
            <>
              <p className="caption">Feedback that was sent</p>
              <p>{state.lastRevisionFeedback}</p>
            </>
          ) : null}
          <FindingsPlaceholder />
          <ReportPlaceholder />
        </>
      ) : null}
      {phase === "awaiting_review" && report ? (
        <>
          {report.report ? (
            <LiveOrFinalReport payload={report} />
          ) : (
            <ReportPlaceholder />
          )}
          <div className="stack">
            <h3>Your review</h3>
            <p className="muted">Enter a reviewer name before approve or feedback.</p>
            <div className="field">
              <label htmlFor="reviewer">Reviewer name</label>
              <input
                id="reviewer"
                type="text"
                maxLength={200}
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void assignReviewer()}
            >
              Save reviewer
            </button>
            {!reviewer ? (
              <p className="muted">
                Save a reviewer name, then approve or send feedback.
              </p>
            ) : null}
            <div className="row two">
              <div className="stack">
                <h3>Approve</h3>
                <p>Accept the current summary and report.</p>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!reviewer || busy}
                  onClick={() => void submitDecision("approve")}
                >
                  Approve
                </button>
              </div>
              <div className="stack">
                <h3>Feedback</h3>
                <p>Ask for a revised report.</p>
                <div className="field">
                  <label htmlFor="feedback">Feedback</label>
                  <textarea
                    id="feedback"
                    maxLength={10_000}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="What should the next revision change?"
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={!reviewer || busy}
                  onClick={() => void submitDecision("revise")}
                >
                  Send feedback
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      {result ? (
        <>
          <TerminalBanner
            workflowType="contract_review"
            finalStatus={result.final_status}
          />
          {result.error ? <div className="banner err">{result.error}</div> : null}
          {result.completeness === "partial" ? (
            <div className="banner warn">
              Partial result: one or more documents failed. Review the outcomes
              below.
            </div>
          ) : null}
          <div className="row four">
            <dl className="fact">
              <dt>Execution status</dt>
              <dd>{result.execution_status}</dd>
            </dl>
            <dl className="fact">
              <dt>Assigned reviewer</dt>
              <dd>{result.reviewer || "Unassigned"}</dd>
            </dl>
            <dl className="fact">
              <dt>Revision count</dt>
              <dd>{result.revision_count}</dd>
            </dl>
            <dl className="fact">
              <dt>Report completeness</dt>
              <dd>{result.completeness}</dd>
            </dl>
          </div>
          <LiveOrFinalReport payload={result} />
          <DocumentFindings
            documents={result.documents}
            animationPrefix={`${result.workflow_id}:${result.revision_count}:final`}
          />
        </>
      ) : null}
      {!revising && phase && phase !== "awaiting_review" && !result ? (
        <p className="muted">
          Human review unlocks when the summary and report are ready.
        </p>
      ) : null}
    </StepFrame>
  );
}
