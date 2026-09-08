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
import { LiveOrFinalReport, TerminalBanner } from "../components/ReportView";
import { StepActions } from "../components/StepActions";
import { StepFrame } from "../components/StepFrame";
import { WorkflowProgress } from "../components/WorkflowProgress";
import { usePoll } from "../hooks/usePoll";
import { submissionFingerprint } from "../lib/fingerprint";
import { workflowViewIsSettled } from "../lib/workflow";
import { useStore } from "../state/store";

export function DecisionStep({ onBack }: { onBack?: () => void }) {
  const {
    state,
    setFlash,
    setNotice,
    setLastRevisionFeedback,
    setLastReviewSubmission,
    setLatestRevision,
    setContractPhase,
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
  const settled = status
    ? workflowViewIsSettled(
        "contract_review",
        status.phase,
        status.result_available,
        Boolean(result),
      )
    : false;

  const { refresh, refreshing } = usePoll(
    async () => {
      if (!contractId) {
        return;
      }
      try {
        const latest = await api.getContractStatus(contractId);
        setStatus(latest);
        setContractPhase(latest.phase);
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
      enabled: Boolean(contractId) && !settled,
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
      setContractPhase(latest.phase);
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
        setContractPhase(latest.phase);
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
        setReport(null);
        setResult(null);
        setReviewStep("decision");
      }
      const after = await api.getContractStatus(contractId);
      setStatus(after);
      setContractPhase(after.phase);
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
      {!result ? (
        <WorkflowProgress
          phase={phase}
          intervalSeconds={state.pollIntervalSeconds}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {revising ? (
        <section className="revision-receipt">
          <p className="eyebrow">Revision request received</p>
          <h3>The report will update here automatically</h3>
          <p>
            You can leave this page open. Temporal is generating a new report
            from the feedback below.
          </p>
          {state.lastRevisionFeedback ? (
            <blockquote>{state.lastRevisionFeedback}</blockquote>
          ) : null}
        </section>
      ) : null}
      {phase === "awaiting_review" && report ? (
        <>
          {report.report ? <LiveOrFinalReport payload={report} /> : null}
          <section className="review-panel">
            <div className="section-heading">
              <p className="eyebrow">Human-in-the-loop decision</p>
              <h3>Review this revision</h3>
              <p className="muted">
                Assign a reviewer, then approve the current report or request a
                focused revision.
              </p>
            </div>
            <div className="reviewer-row">
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
                {status?.reviewer ? "Update reviewer" : "Assign reviewer"}
              </button>
            </div>
            {!reviewer ? (
              <p className="field-help">
                Save a reviewer name, then approve or send feedback.
              </p>
            ) : null}
            <div className="decision-grid">
              <article className="decision-card approve">
                <h3>Approve</h3>
                <p>Accept this report as the final reviewed outcome.</p>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!reviewer || busy}
                  onClick={() => void submitDecision("approve")}
                >
                  Approve
                </button>
              </article>
              <article className="decision-card revise">
                <h3>Request changes</h3>
                <p>Explain exactly what the next report should address.</p>
                <div className="field">
                  <label htmlFor="feedback">Feedback</label>
                  <textarea
                    id="feedback"
                    maxLength={10_000}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Example: compare termination notice periods and strengthen the liability recommendation."
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={!reviewer || busy}
                  onClick={() => void submitDecision("revise")}
                >
                  Request revision
                </button>
              </article>
            </div>
          </section>
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
