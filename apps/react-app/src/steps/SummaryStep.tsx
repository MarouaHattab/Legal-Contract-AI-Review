import { useState } from "react";
import { api } from "../api/client";
import { APIError } from "../api/errors";
import type {
  ContractReportQuery,
  ContractReviewResult,
  ContractWorkflowStatus,
} from "../api/types";
import { DocumentFindings, DocumentProgress } from "../components/DocumentFindings";
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
import { REVIEW_DECISION_PHASES } from "../lib/workflow";
import { pipelineReady } from "../state/logic";
import { useStore } from "../state/store";

export function SummaryStep({
  onBack,
  onReview,
}: {
  onBack: () => void;
  onReview: () => void;
}) {
  const { state, rememberStarted, isDuplicate, setFlash, setReviewStep, setLatestRevision } =
    useStore();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ContractWorkflowStatus | null>(null);
  const [report, setReport] = useState<ContractReportQuery | null>(null);
  const [result, setResult] = useState<ContractReviewResult | null>(null);

  const contractId = state.contractWorkflowId;
  const polling =
    Boolean(contractId) &&
    Boolean(status) &&
    ["extracting", "analyzing", "revising"].includes(status?.phase ?? "");

  const { refresh, refreshing } = usePoll(
    async () => {
      if (!contractId) {
        return;
      }
      try {
        const latest = await api.getContractStatus(contractId);
        setStatus(latest);
        setLatestRevision(latest.current_revision);
        setError(null);
        if (latest.result_available) {
          setResult(await api.getContractResult(contractId));
          setReport(null);
          return;
        }
        if (
          latest.phase === "extracting" ||
          latest.phase === "analyzing" ||
          latest.phase === "revising" ||
          latest.phase === "awaiting_review" ||
          latest.report_available
        ) {
          try {
            setReport(await api.getContractReport(contractId));
          } catch (err) {
            if (!(err instanceof APIError && err.kind === "conflict")) {
              throw err;
            }
          }
        }
      } catch (err) {
        setError(err);
      }
    },
    {
      enabled: Boolean(contractId),
      intervalMs: polling
        ? state.pollIntervalSeconds * 1000
        : Math.max(state.pollIntervalSeconds, 8) * 1000,
    },
  );

  async function startSummary() {
    setError(null);
    const sourcePaths = state.documents.map((item) => item.source_s3_uri);
    const fingerprint = await submissionFingerprint("pipeline_contract", {
      s3_paths: sourcePaths,
      max_revisions: state.maxRevisions,
    });
    if (isDuplicate(fingerprint)) {
      setError(
        new Error(
          "This exact contract review was already started in this browser session.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const markdownPaths = state.documents.map((item) => item.markdown_s3_uri);
      const hashes = state.documents.map((item) => item.markdown_sha256);
      const sizes = state.documents
        .map((item) => Number(item.markdown_size_bytes))
        .filter((value) => Number.isFinite(value) && value >= 0);
      const started = await api.startContractReview({
        s3_paths: sourcePaths,
        max_revisions: state.maxRevisions,
        markdown_s3_paths: markdownPaths.every(Boolean) ? markdownPaths : undefined,
        markdown_sha256s: hashes.every(Boolean) ? hashes : undefined,
        markdown_size_bytes:
          sizes.length === state.documents.length ? sizes : undefined,
      });
      rememberStarted({
        workflowId: started.workflow_id,
        workflowType: "contract_review",
        fingerprint,
      });
      setReviewStep("summary");
      setFlash("Summary started from the Markdown already produced.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!contractId) {
    return (
      <StepFrame
        icon="summary"
        title="Summary"
        description="Document findings first, then the consolidated report. Human review is next."
        footer={
          <StepActions
            continueLabel="Start summary"
            continueEnabled={pipelineReady(state.documents)}
            busy={busy}
            onBack={onBack}
            onContinue={() => void startSummary()}
          />
        }
      >
        <ErrorBanner error={error} />
        <StepActions
          continueLabel="Start summary"
          continueEnabled={pipelineReady(state.documents)}
          busy={busy}
          onBack={onBack}
          onContinue={() => void startSummary()}
        />
        {pipelineReady(state.documents) ? (
          <section className="result-section">
            <div className="result-section-head">
              <div>
                <h3>Ready to summarize</h3>
                <p className="muted">
                  The next request starts from the Markdown already produced.
                  The PDF is not uploaded again.
                </p>
              </div>
            </div>
            <div className="finding-list">
              {state.documents.map((item) => (
                <article key={item.source_s3_uri} className="ready-doc">
                  <span className="status-chip succeeded">Ready</span>
                  <span className="finding-name">{item.filename}</span>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="muted">Finish Markdown conversion before this step.</p>
        )}
      </StepFrame>
    );
  }

  const phase = status?.phase ?? "";
  const canReview = REVIEW_DECISION_PHASES.has(phase);
  const hasFindings = Boolean(
    report?.documents.length || result?.documents.length || status?.documents.length,
  );
  const hasReport = Boolean(report?.report || result?.report);
  const waiting = polling || !status;
  const continueLabel =
    phase === "revising"
      ? "Open Review"
      : canReview
        ? "Go to review"
        : "Waiting for report";
  const reviewNote = canReview
    ? "Human review is next."
    : "The report appears here when Temporal finishes.";

  return (
    <StepFrame
      icon="summary"
      title="Summary"
      description="Document findings first, then the consolidated report. Human review is next."
      footer={
        <StepActions
          note={reviewNote}
          continueLabel={continueLabel}
          continueEnabled={canReview}
          onBack={onBack}
          onContinue={onReview}
        />
      }
    >
      <ErrorBanner error={error} />
      <StepActions
        note={reviewNote}
        continueLabel={continueLabel}
        continueEnabled={canReview}
        onBack={onBack}
        onContinue={onReview}
      />
      {status ? (
        <PhaseBanner
          phase={status.phase}
          executionStatus={status.execution_status}
          waiting={waiting}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      ) : (
        <p className="muted">Loading contract status from FastAPI.</p>
      )}
      <GenerationWait
        phase={phase}
        intervalSeconds={state.pollIntervalSeconds}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        hasFindings={hasFindings}
        hasReport={hasReport}
      />
      {phase === "extracting" ? (
        <div className="banner">
          Summarizing the Markdown from the previous step. The PDF is not
          uploaded or extracted again.
        </div>
      ) : null}
      {phase === "analyzing" ? (
        <div className="banner">
          Summaries are in. The consolidated report is being written.
        </div>
      ) : null}
      {phase === "revising" ? (
        <div className="banner">
          A revision is running. Open Review to wait for the new report.
        </div>
      ) : null}
      {result ? (
        <>
          <TerminalBanner
            workflowType="contract_review"
            finalStatus={result.final_status}
          />
          {result.error ? <div className="banner err">{result.error}</div> : null}
          {result.documents.length ? (
            <DocumentFindings
              documents={result.documents}
              animationPrefix={`${result.workflow_id}:${result.revision_count}:final`}
            />
          ) : null}
          <LiveOrFinalReport payload={result} />
        </>
      ) : report ? (
        <>
          {report.documents.length ? (
            <DocumentFindings
              documents={report.documents}
              animationPrefix={`${report.workflow_id}:${report.current_revision}`}
            />
          ) : status?.documents.length ? (
            <DocumentProgress documents={status.documents} />
          ) : null}
          {report.report ? (
            <LiveOrFinalReport payload={report} />
          ) : (
            <ReportPlaceholder />
          )}
        </>
      ) : status?.documents.length ? (
        <DocumentProgress documents={status.documents} />
      ) : waiting ? (
        <FindingsPlaceholder />
      ) : null}
    </StepFrame>
  );
}
