import { statusLabel } from "../features/workflows/workflowState"

type StatusBadgeProps = {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase()
  const tone =
    normalized === "completed" || normalized === "approved"
      ? "success"
      : ["failed", "cancelled", "timed_out"].includes(normalized)
        ? "danger"
        : normalized === "running"
          ? "active"
          : "neutral"

  return (
    <span className={`status-badge status-${tone}`}>
      <span aria-hidden="true" className="status-dot" />
      {statusLabel(status)}
    </span>
  )
}
