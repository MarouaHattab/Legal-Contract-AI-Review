import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type {
  ContractReviewResult,
  ContractWorkflowStatus,
  PDFWorkflowResult,
  PDFWorkflowStatus,
  WorkflowSummary,
  WorkflowType,
} from "../api/types";
import { DocumentProgress } from "../components/DocumentFindings";
import { ErrorBanner } from "../components/ErrorBanner";
import { Flash } from "../components/Flash";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PhaseBanner } from "../components/PhaseBanner";
import { LiveOrFinalReport, TerminalBanner } from "../components/ReportView";
import { usePoll } from "../hooks/usePoll";
import { formatBytes } from "../lib/s3";
import {
  GENERATING_PHASES,
  uiStatus,
  workflowIsTerminal,
  workflowTypeLabel,
} from "../lib/workflow";
import { useStore } from "../state/store";

export function StatusPage() {
  const { state, setSelectedWorkflow, continueContractOnReview } = useStore();
  const navigate = useNavigate();
  const [listError, setListError] = useState<unknown>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [formType, setFormType] = useState<WorkflowType>(
    state.selectedWorkflowType || "pdf",
  );
  const [formId, setFormId] = useState(state.selectedWorkflowId);

  useEffect(() => {
    let cancelled = false;
    api
      .listWorkflows(50)
      .then((response) => {
        if (!cancelled) {
          setWorkflows(response.workflows);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setListError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.apiBaseUrl]);

  function inspect(workflowId: string, workflowType: WorkflowType) {
    setSelectedWorkflow(workflowId, workflowType);
    setFormId(workflowId);
    setFormType(workflowType);
  }

  return (
    <>
      <h1 className="page-title">Status</h1>
      <p className="page-meta">
        <span>Temporal workflows</span>
        <span>Live queries through FastAPI</span>
      </p>
      <Flash />
      <section className="panel stack">
        <h2>Recent workflows</h2>
        <ErrorBanner error={listError} />
        {!workflows.length && !listError ? (
          <p className="muted">No previous document workflows were found.</p>
        ) : null}
        {workflows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workflow ID</th>
                  <th>Type</th>
                  <th>Execution</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => (
                  <tr key={workflow.workflow_id}>
                    <td>{workflow.workflow_id}</td>
                    <td>{workflowTypeLabel(workflow.workflow_type)}</td>
                    <td>{workflow.execution_status}</td>
                    <td>{new Date(workflow.start_time).toISOString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          inspect(workflow.workflow_id, workflow.workflow_type)
                        }
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="panel stack" style={{ marginTop: 24 }}>
        <h2>Inspect by ID</h2>
        <div className="row two">
          <div className="field">
            <label htmlFor="wf-type">Workflow type</label>
            <select
              id="wf-type"
              value={formType}
              onChange={(event) =>
                setFormType(event.target.value as WorkflowType)
              }
            >
              <option value="pdf">PDF processing</option>
              <option value="contract_review">Contract review</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="wf-id">Workflow ID</label>
            <input
              id="wf-id"
              type="text"
              value={formId}
              onChange={(event) => setFormId(event.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const normalized = formId.trim();
            if (!normalized) {
              setListError(new Error("Enter a workflow ID."));
              return;
            }
            inspect(normalized, formType);
          }}
        >
          Inspect workflow
        </button>
        {state.selectedWorkflowId &&
        (state.selectedWorkflowType === "pdf" ||
          state.selectedWorkflowType === "contract_review") ? (
          <>
            <p className="caption">Selected workflow</p>
            <div className="uri">{state.selectedWorkflowId}</div>
            {state.selectedWorkflowType === "contract_review" ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  continueContractOnReview(state.selectedWorkflowId);
                  navigate("/");
                }}
              >
                Continue on Review
              </button>
            ) : null}
            <LiveMonitor
              workflowId={state.selectedWorkflowId}
              workflowType={state.selectedWorkflowType}
            />
          </>
        ) : (
          <p className="muted">Enter a workflow ID or select a recent run.</p>
        )}
      </section>
    </>
  );
}

function LiveMonitor({
  workflowId,
  workflowType,
}: {
  workflowId: string;
  workflowType: WorkflowType;
}) {
  const { state, setLatestRevision } = useStore();
  const [error, setError] = useState<unknown>(null);
  const [pdfStatus, setPdfStatus] = useState<PDFWorkflowStatus | null>(null);
  const [contractStatus, setContractStatus] =
    useState<ContractWorkflowStatus | null>(null);
  const [pdfResult, setPdfResult] = useState<PDFWorkflowResult | null>(null);
  const [contractResult, setContractResult] =
    useState<ContractReviewResult | null>(null);

  const phase = workflowType === "pdf" ? pdfStatus?.phase : contractStatus?.phase;
  const resultAvailable =
    workflowType === "pdf"
      ? Boolean(pdfStatus?.result_available)
      : Boolean(contractStatus?.result_available);
  const terminal = phase
    ? workflowIsTerminal(workflowType, phase, resultAvailable)
    : false;

  const { refresh, refreshing } = usePoll(
    async () => {
      try {
        if (workflowType === "pdf") {
          const status = await api.getPdfStatus(workflowId);
          setPdfStatus(status);
          if (status.result_available) {
            setPdfResult(await api.getPdfResult(workflowId));
          }
        } else {
          const status = await api.getContractStatus(workflowId);
          setContractStatus(status);
          setLatestRevision(status.current_revision);
          if (status.result_available) {
            setContractResult(await api.getContractResult(workflowId));
          }
        }
        setError(null);
      } catch (err) {
        setError(err);
      }
    },
    {
      enabled: Boolean(workflowId) && !terminal,
      intervalMs: state.pollIntervalSeconds * 1000,
    },
  );

  const status = workflowType === "pdf" ? pdfStatus : contractStatus;

  return (
    <div className="stack">
      <ErrorBanner error={error} />
      {status ? (
        <>
          <PhaseBanner
            phase={status.phase}
            executionStatus={status.execution_status}
            waiting={
              GENERATING_PHASES.has(status.phase) ||
              status.phase === "processing"
            }
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
          <div className="row three">
            <dl className="fact">
              <dt>Workflow ID</dt>
              <dd>{status.workflow_id}</dd>
            </dl>
            <dl className="fact">
              <dt>Workflow type</dt>
              <dd>{workflowTypeLabel(workflowType)}</dd>
            </dl>
            <dl className="fact">
              <dt>UI status</dt>
              <dd>
                {uiStatus(
                  status.phase,
                  status.execution_status,
                  status.result_available,
                )}
              </dd>
            </dl>
            <dl className="fact">
              <dt>Temporal phase</dt>
              <dd>{status.phase}</dd>
            </dl>
            <dl className="fact">
              <dt>Execution status</dt>
              <dd>{status.execution_status}</dd>
            </dl>
            {contractStatus ? (
              <>
                <dl className="fact">
                  <dt>Reviewer</dt>
                  <dd>{contractStatus.reviewer || "Unassigned"}</dd>
                </dl>
                <dl className="fact">
                  <dt>Revision</dt>
                  <dd>{contractStatus.current_revision}</dd>
                </dl>
                <dl className="fact">
                  <dt>Completeness</dt>
                  <dd>{contractStatus.completeness}</dd>
                </dl>
                <dl className="fact">
                  <dt>Report available</dt>
                  <dd>{contractStatus.report_available ? "Yes" : "No"}</dd>
                </dl>
              </>
            ) : null}
          </div>
          {contractStatus ? (
            <DocumentProgress documents={contractStatus.documents} />
          ) : null}
          {terminal ? (
            <p className="muted">
              Terminal state reached. Automatic polling has stopped; Refresh
              remains available for a manual check.
            </p>
          ) : (
            <p className="muted">
              Refreshing every {state.pollIntervalSeconds} seconds while this
              workflow is active.
            </p>
          )}
        </>
      ) : (
        <p className="muted">Loading workflow status.</p>
      )}
      {pdfResult ? (
        <>
          <TerminalBanner
            workflowType="pdf"
            finalStatus={pdfResult.final_status}
          />
          {pdfResult.error ? (
            <div className="banner err">{pdfResult.error}</div>
          ) : null}
          {pdfResult.result ? (
            <MarkdownPreview
              uri={pdfResult.result.output_s3_path}
              sizeBytes={pdfResult.result.size_bytes}
              sha256={pdfResult.result.sha256}
            />
          ) : null}
          {pdfResult.result ? (
            <dl className="fact">
              <dt>Content type</dt>
              <dd>{pdfResult.result.content_type}</dd>
            </dl>
          ) : null}
          {pdfResult.result ? (
            <dl className="fact">
              <dt>Size</dt>
              <dd>{formatBytes(pdfResult.result.size_bytes)}</dd>
            </dl>
          ) : null}
        </>
      ) : null}
      {contractResult ? (
        <>
          <TerminalBanner
            workflowType="contract_review"
            finalStatus={contractResult.final_status}
          />
          {contractResult.error ? (
            <div className="banner err">{contractResult.error}</div>
          ) : null}
          <LiveOrFinalReport payload={contractResult} />
        </>
      ) : null}
    </div>
  );
}
