import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"

import { api } from "../../api/client"
import { Feedback } from "../../components/Feedback"
import { StatusBadge } from "../../components/StatusBadge"
import { WorkflowRail } from "../../components/WorkflowRail"
import type {
  ContractReviewResult,
  ContractWorkflowStatus,
  PdfWorkflowStatus,
  WorkflowType,
} from "../../types/workflows"
import { ContractReport } from "./ContractReport"
import { DocumentOutcomes } from "./DocumentOutcomes"
import { HumanReview } from "./HumanReview"
import { MarkdownArtifact } from "./MarkdownArtifact"
import {
  getWorkflowSteps,
  isTerminal,
  statusLabel,
  workflowTypeLabel,
} from "./workflowState"

type DetailHeaderProps = {
  type: WorkflowType
  workflowId: string
  executionStatus?: string
  refreshing: boolean
  onRefresh: () => void
}

function DetailHeader({
  type,
  workflowId,
  executionStatus,
  refreshing,
  onRefresh,
}: DetailHeaderProps) {
  return (
    <>
      <Link className="back-link" to="/">
        Back to all workflows
      </Link>
      <header className="page-header detail-header">
        <div>
          <p className="eyebrow">Workflow detail</p>
          <h1>{workflowTypeLabel(type)}</h1>
          <code className="detail-workflow-id">{workflowId}</code>
        </div>
        <div className="detail-actions">
          {executionStatus ? <StatusBadge status={executionStatus} /> : null}
          <button
            className="button button-secondary"
            disabled={refreshing}
            onClick={onRefresh}
            type="button"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>
    </>
  )
}

function DetailError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Feedback actionLabel="Retry" onAction={retry} tone="error">
      {error instanceof Error ? error.message : "Workflow status is unavailable."}
    </Feedback>
  )
}

function PdfDetail({ workflowId }: { workflowId: string }) {
  const status = useQuery({
    queryKey: ["workflow", "pdf", workflowId, "status"],
    queryFn: () => api.getPdfStatus(workflowId),
    refetchInterval: (query) => {
      const data = query.state.data as PdfWorkflowStatus | undefined
      return data && isTerminal("pdf", data) ? false : 3_000
    },
  })
  const result = useQuery({
    queryKey: ["workflow", "pdf", workflowId, "result"],
    queryFn: () => api.getPdfResult(workflowId),
    enabled: status.data?.result_available === true,
  })

  return (
    <main className="shell">
      <DetailHeader
        executionStatus={status.data?.execution_status}
        onRefresh={() => void status.refetch()}
        refreshing={status.isFetching}
        type="pdf"
        workflowId={workflowId}
      />
      {status.data ? (
        <WorkflowRail steps={getWorkflowSteps("pdf", status.data.phase)} />
      ) : null}
      {status.isError ? (
        <DetailError error={status.error} retry={() => void status.refetch()} />
      ) : status.isPending ? (
        <div className="loading-line detail-loading" role="status">
          Loading workflow status…
        </div>
      ) : !status.data.result_available ? (
        <Feedback tone="info">
          {statusLabel(status.data.phase)}. This page refreshes while processing continues.
        </Feedback>
      ) : result.isError ? (
        <DetailError error={result.error} retry={() => void result.refetch()} />
      ) : result.data?.result ? (
        <>
          <Feedback tone="success">PDF extraction completed.</Feedback>
          <MarkdownArtifact
            contentType={result.data.result.content_type}
            sha256={result.data.result.sha256}
            sizeBytes={result.data.result.size_bytes}
            uri={result.data.result.output_s3_path}
          />
        </>
      ) : result.data ? (
        <Feedback tone="error">
          {result.data.error || `PDF extraction ${statusLabel(result.data.final_status)}.`}
        </Feedback>
      ) : (
        <div className="loading-line detail-loading" role="status">
          Loading workflow result…
        </div>
      )}
    </main>
  )
}

function ContractDetail({ workflowId }: { workflowId: string }) {
  const status = useQuery({
    queryKey: ["workflow", "contract_review", workflowId, "status"],
    queryFn: () => api.getContractStatus(workflowId),
    refetchInterval: (query) => {
      const data = query.state.data as ContractWorkflowStatus | undefined
      return data && isTerminal("contract_review", data) ? false : 3_000
    },
  })
  const report = useQuery({
    queryKey: ["workflow", "contract_review", workflowId, "report"],
    queryFn: () => api.getContractReport(workflowId),
    enabled:
      status.data?.report_available === true &&
      status.data?.result_available === false,
  })
  const result = useQuery({
    queryKey: ["workflow", "contract_review", workflowId, "result"],
    queryFn: () => api.getContractResult(workflowId),
    enabled: status.data?.result_available === true,
  })

  const finalResult = result.data as ContractReviewResult | undefined
  const visibleReport = finalResult?.report ?? report.data?.report
  const visibleDocuments = finalResult?.documents ?? report.data?.documents ?? []
  const revision = finalResult?.revision_count ?? report.data?.current_revision

  return (
    <main className="shell">
      <DetailHeader
        executionStatus={status.data?.execution_status}
        onRefresh={() => void status.refetch()}
        refreshing={status.isFetching}
        type="contract_review"
        workflowId={workflowId}
      />
      {status.data ? (
        <>
          <WorkflowRail
            steps={getWorkflowSteps("contract_review", status.data.phase)}
          />
          <dl className="workflow-facts">
            <div>
              <dt>Phase</dt>
              <dd>{statusLabel(status.data.phase)}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{status.data.current_revision}</dd>
            </div>
            <div>
              <dt>Reviewer</dt>
              <dd>{status.data.reviewer || "Not assigned"}</dd>
            </div>
            <div>
              <dt>Documents</dt>
              <dd>{status.data.documents.length}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {status.isError ? (
        <DetailError error={status.error} retry={() => void status.refetch()} />
      ) : status.isPending ? (
        <div className="loading-line detail-loading" role="status">
          Loading workflow status…
        </div>
      ) : (
        <>
          {status.data.completeness === "partial" ? (
            <Feedback tone="warning">
              This report is partial because at least one document could not be processed.
            </Feedback>
          ) : null}
          {!status.data.report_available && !status.data.result_available ? (
            <Feedback tone="info">
              {statusLabel(status.data.phase)}. This page refreshes while work continues.
            </Feedback>
          ) : null}
          {report.isError ? (
            <DetailError error={report.error} retry={() => void report.refetch()} />
          ) : null}
          {result.isError ? (
            <DetailError error={result.error} retry={() => void result.refetch()} />
          ) : null}
          {finalResult ? (
            <Feedback
              tone={finalResult.final_status === "approved" ? "success" : "warning"}
            >
              {finalResult.error ||
                `Contract review ${statusLabel(finalResult.final_status)}.`}
            </Feedback>
          ) : null}
          {visibleReport ? (
            <ContractReport report={visibleReport} revision={revision} />
          ) : null}
          <DocumentOutcomes documents={visibleDocuments} />
          <HumanReview
            key={`${status.data.current_revision}:${status.data.reviewer}`}
            status={status.data}
            workflowId={workflowId}
          />
        </>
      )}
    </main>
  )
}

export function WorkflowDetail() {
  const { workflowType, workflowId } = useParams()
  const validType =
    workflowType === "pdf" || workflowType === "contract_review"
      ? workflowType
      : null

  if (!validType || !workflowId) {
    return (
      <main className="shell compact-page">
        <h1>Workflow not found</h1>
        <p>The workflow type or identifier is missing.</p>
        <Link className="text-link" to="/">
          Return to workflows
        </Link>
      </main>
    )
  }

  return validType === "pdf" ? (
    <PdfDetail workflowId={workflowId} />
  ) : (
    <ContractDetail workflowId={workflowId} />
  )
}
