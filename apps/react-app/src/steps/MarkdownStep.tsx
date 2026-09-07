import { useState } from "react";
import { api } from "../api/client";
import { APIError } from "../api/errors";
import type { PipelineDocument } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { StepActions } from "../components/StepActions";
import { StepFrame } from "../components/StepFrame";
import { usePoll } from "../hooks/usePoll";
import { submissionFingerprint } from "../lib/fingerprint";
import { workflowIsTerminal } from "../lib/workflow";
import {
  pipelineHasFailures,
  pipelineInProgress,
  pipelineReady,
} from "../state/logic";
import { useStore } from "../state/store";

async function syncPdfDocument(
  item: PipelineDocument,
  updateDocument: (source: string, changes: Partial<PipelineDocument>) => void,
): Promise<void> {
  if (
    item.markdown_ready === "true" ||
    item.error ||
    !item.pdf_workflow_id
  ) {
    return;
  }
  const status = await api.getPdfStatus(item.pdf_workflow_id);
  if (
    !workflowIsTerminal("pdf", status.phase, status.result_available)
  ) {
    return;
  }
  try {
    const result = await api.getPdfResult(item.pdf_workflow_id);
    if (result.result) {
      updateDocument(item.source_s3_uri, {
        markdown_s3_uri: result.result.output_s3_path,
        markdown_sha256: result.result.sha256,
        markdown_size_bytes: String(result.result.size_bytes),
        markdown_ready: "true",
        error: "",
      });
    } else {
      updateDocument(item.source_s3_uri, {
        error: result.error || "PDF processing did not produce Markdown.",
      });
    }
  } catch (error) {
    if (error instanceof APIError && error.kind === "conflict") {
      return;
    }
    updateDocument(item.source_s3_uri, {
      error: error instanceof Error ? error.message : "PDF result failed.",
    });
  }
}

export function MarkdownStep({
  onBack,
  onSummary,
}: {
  onBack: () => void;
  onSummary: () => void;
}) {
  const {
    state,
    updateDocument,
    rememberStarted,
    isDuplicate,
    setFlash,
    setReviewStep,
  } = useStore();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ready = pipelineReady(state.documents);
  const converting = pipelineInProgress(state.documents);
  const failed = pipelineHasFailures(state.documents) && !converting;

  usePoll(
    async () => {
      for (const item of state.documents) {
        try {
          await syncPdfDocument(item, updateDocument);
        } catch (err) {
          setError(err);
        }
      }
    },
    {
      enabled: converting,
      intervalMs: state.pollIntervalSeconds * 1000,
    },
  );

  async function startSummary() {
    setError(null);
    if (state.contractWorkflowId) {
      onSummary();
      return;
    }
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

  return (
    <StepFrame
      icon="markdown"
      title="Markdown"
      description="This is the extracted Markdown. Preview or download it, then continue."
      footer={
        <StepActions
          note="Derived by Temporal from the uploaded PDFs"
          continueLabel={
            state.contractWorkflowId ? "Go to summary" : "Start summary"
          }
          continueEnabled={ready}
          busy={busy}
          onBack={onBack}
          onContinue={() => void startSummary()}
        />
      }
    >
      <ErrorBanner error={error} />
      <StepActions
        note="Stay on this step to read the Markdown. You do not need to scroll to the end."
        continueLabel={
          state.contractWorkflowId ? "Go to summary" : "Start summary"
        }
        continueEnabled={ready}
        busy={busy}
        onBack={onBack}
        onContinue={() => void startSummary()}
      />
      {converting ? (
        <p className="muted">
          Converting. Status updates every {state.pollIntervalSeconds} seconds
          without reloading the page.
        </p>
      ) : null}
      {!state.documents.length ? (
        <p className="muted">Upload a document first.</p>
      ) : (
        state.documents.map((item) => (
          <article key={item.source_s3_uri} className="stack">
            <h3>
              {item.filename} —{" "}
              {item.markdown_ready === "true"
                ? "Ready"
                : item.error
                  ? "Failed"
                  : "Converting"}
            </h3>
            {item.error ? <div className="banner err">{item.error}</div> : null}
            {item.markdown_ready === "true" && item.markdown_s3_uri ? (
              <MarkdownPreview
                uri={item.markdown_s3_uri}
                sizeBytes={
                  item.markdown_size_bytes
                    ? Number(item.markdown_size_bytes)
                    : undefined
                }
                sha256={item.markdown_sha256}
              />
            ) : !item.error ? (
              <p className="muted">
                Waiting for Temporal to finish Markdown conversion.
              </p>
            ) : null}
          </article>
        ))
      )}
      {failed ? (
        <div className="banner err">
          Markdown conversion failed. Start over to try another file.
        </div>
      ) : null}
      {!ready && !failed ? (
        <p className="muted">Next unlocks when Markdown is ready.</p>
      ) : null}
      <MaxRevisionsInput />
    </StepFrame>
  );
}

function MaxRevisionsInput() {
  const { state, setMaxRevisions } = useStore();
  if (!pipelineReady(state.documents)) {
    return null;
  }
  return (
    <div className="field">
      <label htmlFor="max-revisions">Maximum report revisions</label>
      <input
        id="max-revisions"
        type="number"
        min={0}
        max={10}
        step={1}
        value={state.maxRevisions}
        onChange={(event) =>
          setMaxRevisions(Number(event.target.value) || 0)
        }
      />
    </div>
  );
}
