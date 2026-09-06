import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "../../api/client"
import { Feedback } from "../../components/Feedback"
import type { WorkflowType } from "../../types/workflows"
import { CreateWorkflowDialog } from "./CreateWorkflowDialog"
import { WorkflowList } from "./WorkflowList"

type WorkflowFilter = "all" | WorkflowType

export function WorkflowHome() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<WorkflowFilter>("all")
  const [search, setSearch] = useState("")
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(50),
    refetchInterval: 15_000,
  })

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return (workflows.data?.workflows ?? []).filter((workflow) => {
      const matchesType =
        workflowType === "all" || workflow.workflow_type === workflowType
      const matchesSearch =
        !normalizedSearch ||
        workflow.workflow_id.toLowerCase().includes(normalizedSearch)
      return matchesType && matchesSearch
    })
  }, [search, workflowType, workflows.data])

  return (
    <main className="shell">
      <header className="page-header home-header">
        <div>
          <p className="eyebrow">Document operations</p>
          <h1>All workflows</h1>
          <p className="page-summary">
            Start, monitor, and review PDF and contract workflows in one place.
          </p>
        </div>
        <button
          className="button button-primary header-action"
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          New workflow
        </button>
      </header>

      <section aria-labelledby="workflow-list-title" className="workspace-section">
        <div className="section-heading">
          <div>
            <h2 id="workflow-list-title">Recent activity</h2>
            <p>PDF extraction and contract review runs from Temporal.</p>
          </div>
          <button
            className="button button-secondary"
            disabled={workflows.isFetching}
            onClick={() => void workflows.refetch()}
            type="button"
          >
            {workflows.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="workflow-filters">
          <label className="field">
            <span>Search workflows</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Workflow ID"
              type="search"
              value={search}
            />
          </label>
          <label className="field filter-field">
            <span>Workflow type</span>
            <select
              onChange={(event) =>
                setWorkflowType(event.target.value as WorkflowFilter)
              }
              value={workflowType}
            >
              <option value="all">All types</option>
              <option value="pdf">PDF extraction</option>
              <option value="contract_review">Contract review</option>
            </select>
          </label>
        </div>

        {workflows.isError ? (
          <Feedback
            actionLabel="Retry"
            onAction={() => void workflows.refetch()}
            tone="error"
          >
            {workflows.error instanceof Error
              ? workflows.error.message
              : "Workflows could not be loaded."}
          </Feedback>
        ) : workflows.isPending ? (
          <div className="loading-line" role="status">
            Loading workflows…
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No workflows yet</h3>
            <p>
              {search || workflowType !== "all"
                ? "No workflows match the current filters."
                : "Start a workflow to see it here."}
            </p>
          </div>
        ) : (
          <WorkflowList workflows={filtered} />
        )}
      </section>

      <CreateWorkflowDialog
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      />
    </main>
  )
}
