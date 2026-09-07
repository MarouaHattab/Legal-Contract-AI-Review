import { useEffect, useMemo, useState } from "react";
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
import { WorkflowStatusBadge } from "../components/WorkflowStatusBadge";
import { usePoll } from "../hooks/usePoll";
import { formatBytes } from "../lib/s3";
import {
  GENERATING_PHASES,
  executionCategory,
  executionIsActive,
  relativeWorkflowTime,
  summarizeExecutions,
  uiStatus,
  workflowIsTerminal,
  workflowTypeLabel,
  type ExecutionFilter,
} from "../lib/workflow";
import { useStore } from "../state/store";

export function StatusPage() {
  const { state, setSelectedWorkflow, continueContractOnReview } = useStore();
  const navigate = useNavigate();
  const [listError, setListError] = useState<unknown>(null);
  const [inspectError, setInspectError] = useState<unknown>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<WorkflowType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ExecutionFilter>("all");
  const [formType, setFormType] = useState<WorkflowType>(
    state.selectedWorkflowType || "pdf",
  );
  const [formId, setFormId] = useState(state.selectedWorkflowId);

  const listIsActive =
    !listLoaded || workflows.some((workflow) => executionIsActive(workflow.execution_status));
  const { refresh: refreshList, refreshing: listRefreshing } = usePoll(
    async () => {
      try {
        const response = await api.listWorkflows(50);
        setWorkflows(response.workflows);
        setListError(null);
      } catch (error) {
        setListError(error);
      } finally {
        setListLoaded(true);
      }
    },
    {
      enabled: listIsActive,
      intervalMs: state.pollIntervalSeconds * 1000,
    },
  );

  useEffect(() => {
    setListLoaded(false);
  }, [state.apiBaseUrl]);

  const metrics = useMemo(() => summarizeExecutions(workflows), [workflows]);
  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workflows.filter((workflow) => {
      if (typeFilter !== "all" && workflow.workflow_type !== typeFilter) {
        return false;
      }
      if (
        statusFilter !== "all" &&
        executionCategory(workflow.execution_status) !== statusFilter
      ) {
        return false;
      }
      return (
        !query ||
        workflow.workflow_id.toLowerCase().includes(query) ||
        workflowTypeLabel(workflow.workflow_type).toLowerCase().includes(query)
      );
    });
  }, [search, statusFilter, typeFilter, workflows]);

  function inspect(workflowId: string, workflowType: WorkflowType) {
    setInspectError(null);
    setSelectedWorkflow(workflowId, workflowType);
    setFormId(workflowId);
    setFormType(workflowType);
  }

  return (
    <>
      <p className="eyebrow">Operations desk</p>
      <h1 className="page-title">Workflow status</h1>
      <p className="page-meta">
        <span>Temporal-backed history</span>
        <span>
          {listIsActive
            ? `Live · refreshes every ${state.pollIntervalSeconds}s`
            : "Snapshot · no active workflows"}
        </span>
      </p>
      <Flash />
      <section className="metric-grid" aria-label="Workflow summary">
        <article className="metric-card">
          <span>Visible history</span>
          <strong>{metrics.total}</strong>
          <small>Most recent workflow runs</small>
        </article>
        <article className="metric-card active">
          <span>Active</span>
          <strong>{metrics.active}</strong>
          <small>Polling automatically</small>
        </article>
        <article className="metric-card complete">
          <span>Completed</span>
          <strong>{metrics.completed}</strong>
          <small>Results available</small>
        </article>
        <article className="metric-card attention">
          <span>Needs attention</span>
          <strong>{metrics.attention}</strong>
          <small>Failed, timed out, or cancelled</small>
        </article>
      </section>
      <section className="panel workflow-ledger">
        <div className="section-heading split">
          <div>
            <p className="eyebrow">Run history</p>
            <h2>Recent workflows</h2>
            <p className="muted">
              Select a row to inspect live phase details and final artifacts.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            disabled={listRefreshing}
            onClick={() => void refreshList()}
          >
            {listRefreshing ? "Refreshing…" : "Refresh list"}
          </button>
        </div>
        <ErrorBanner error={listError} />
        <div className="workflow-toolbar">
          <div className="field workflow-search">
            <label htmlFor="workflow-search">Find a workflow</label>
            <input
              id="workflow-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by workflow ID"
            />
          </div>
          <div className="field">
            <label htmlFor="workflow-type-filter">Workflow type</label>
            <select
              id="workflow-type-filter"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as WorkflowType | "all")
              }
            >
              <option value="all">All types</option>
              <option value="pdf">PDF processing</option>
              <option value="contract_review">Contract review</option>
            </select>
          </div>
        </div>
        <div className="filter-tabs" aria-label="Filter by execution status">
          {(
            [
              ["all", "All", metrics.total],
              ["active", "Active", metrics.active],
              ["completed", "Completed", metrics.completed],
              ["attention", "Needs attention", metrics.attention],
            ] as Array<[ExecutionFilter, string, number]>
          ).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
        {!listLoaded && !listError ? (
          <div className="empty-state compact">Loading workflow history…</div>
        ) : null}
        {listLoaded && !workflows.length && !listError ? (
          <p className="muted">No previous document workflows were found.</p>
        ) : null}
        {workflows.length && !filteredWorkflows.length ? (
          <div className="empty-state compact">
            No workflows match these filters.
          </div>
        ) : null}
        {filteredWorkflows.length ? (
          <div className="table-wrap">
            <table className="status-table">
              <thead>
                <tr>
                  <th>Workflow ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Timeline</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((workflow) => (
                  <tr key={workflow.workflow_id}>
                    <td data-label="Workflow ID">
                      <code className="workflow-id" title={workflow.workflow_id}>
                        {workflow.workflow_id}
                      </code>
                    </td>
                    <td data-label="Type">{workflowTypeLabel(workflow.workflow_type)}</td>
                    <td data-label="Status">
                      <WorkflowStatusBadge status={workflow.execution_status} />
                    </td>
                    <td data-label="Timeline">
                      <time
                        dateTime={workflow.start_time}
                        title={formatTimestamp(workflow.start_time)}
                      >
                        Started {relativeWorkflowTime(workflow.start_time)}
                      </time>
                      {workflow.close_time ? (
                        <small title={formatTimestamp(workflow.close_time)}>
                          Finished {relativeWorkflowTime(workflow.close_time)}
                        </small>
                      ) : (
                        <small>Still in progress</small>
                      )}
                    </td>
                    <td data-label="Action">
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
      <section className="panel workflow-inspector">
        <div className="section-heading">
          <p className="eyebrow">Workflow inspector</p>
          <h2>Inspect a run</h2>
          <p className="muted">
            Open a recent row above, or paste an exact workflow ID.
          </p>
        </div>
        <div className="inspect-form">
          <div className="field inspect-id-field">
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
          <button
            type="button"
            className="btn primary inspect-submit"
            onClick={() => {
              const normalized = formId.trim();
              if (!normalized) {
                setInspectError(new Error("Enter a workflow ID."));
                return;
              }
              inspect(normalized, formType);
            }}
          >
            Inspect workflow
          </button>
        </div>
        <ErrorBanner error={inspectError} />
        {state.selectedWorkflowId &&
        (state.selectedWorkflowType === "pdf" ||
          state.selectedWorkflowType === "contract_review") ? (
          <div className="selected-workflow">
            <div className="selected-workflow-head">
              <div>
                <p className="caption">Selected workflow</p>
                <code>{state.selectedWorkflowId}</code>
              </div>
              <div className="selected-workflow-actions">
                {state.selectedWorkflowType === "contract_review" ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      continueContractOnReview(state.selectedWorkflowId);
                      navigate("/");
                    }}
                  >
                    Open in Review
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSelectedWorkflow("", "")}
                >
                  Clear
                </button>
              </div>
            </div>
            <LiveMonitor
              workflowId={state.selectedWorkflowId}
              workflowType={state.selectedWorkflowType}
            />
          </div>
        ) : (
          <p className="muted">Enter a workflow ID or select a recent run.</p>
        )}
      </section>
    </>
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
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
