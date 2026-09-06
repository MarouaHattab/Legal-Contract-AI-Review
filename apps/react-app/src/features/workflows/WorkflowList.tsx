import { Link } from "react-router-dom"

import { StatusBadge } from "../../components/StatusBadge"
import type { WorkflowSummary } from "../../types/workflows"
import { workflowTypeLabel } from "./workflowState"

type WorkflowListProps = {
  workflows: WorkflowSummary[]
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unavailable" : dateFormatter.format(date)
}

export function WorkflowList({ workflows }: WorkflowListProps) {
  return (
    <div className="table-frame">
      <table className="workflow-table">
        <thead>
          <tr>
            <th scope="col">Workflow</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Started</th>
            <th scope="col">Closed</th>
            <th aria-label="Actions" scope="col" />
          </tr>
        </thead>
        <tbody>
          {workflows.map((workflow) => (
            <tr key={`${workflow.workflow_id}:${workflow.run_id}`}>
              <td data-label="Workflow">
                <span className="workflow-id">{workflow.workflow_id}</span>
              </td>
              <td data-label="Type">{workflowTypeLabel(workflow.workflow_type)}</td>
              <td data-label="Status">
                <StatusBadge status={workflow.execution_status} />
              </td>
              <td data-label="Started">{formatDate(workflow.start_time)}</td>
              <td data-label="Closed">{formatDate(workflow.close_time)}</td>
              <td className="table-action" data-label="">
                <Link
                  aria-label={`Open ${workflow.workflow_id}`}
                  className="row-link"
                  to={`/workflows/${workflow.workflow_type}/${encodeURIComponent(workflow.workflow_id)}`}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
