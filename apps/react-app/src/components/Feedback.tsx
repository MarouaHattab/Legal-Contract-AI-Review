import type { ReactNode } from "react"

type FeedbackProps = {
  children: ReactNode
  tone?: "error" | "info" | "success" | "warning"
  actionLabel?: string
  onAction?: () => void
}

export function Feedback({
  children,
  tone = "info",
  actionLabel,
  onAction,
}: FeedbackProps) {
  return (
    <div
      className={`feedback feedback-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span>{children}</span>
      {actionLabel && onAction ? (
        <button className="feedback-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
