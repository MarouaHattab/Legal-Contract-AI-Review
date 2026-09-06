import type { WorkflowType } from "../../types/workflows"

export type StepState = "complete" | "active" | "pending" | "error"

export type WorkflowStep = {
  id: string
  label: string
  state: StepState
}

type StatusShape = {
  phase: string
  result_available: boolean
}

const PDF_TERMINAL_PHASES = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
])

const CONTRACT_TERMINAL_PHASES = new Set([
  "approved",
  "timed_out",
  "revision_limit_reached",
  "cancelled",
  "failed",
])

const ERROR_PHASES = new Set([
  "failed",
  "cancelled",
  "timed_out",
  "revision_limit_reached",
])

export function isTerminal(type: WorkflowType, status: StatusShape): boolean {
  if (status.result_available) return true
  return type === "pdf"
    ? PDF_TERMINAL_PHASES.has(status.phase)
    : CONTRACT_TERMINAL_PHASES.has(status.phase)
}

function stateForPosition(
  index: number,
  activeIndex: number,
  terminalError: boolean,
  finalIndex: number,
): StepState {
  if (terminalError && index === finalIndex) return "error"
  if (index < activeIndex) return "complete"
  if (index === activeIndex) return terminalError ? "complete" : "active"
  return "pending"
}

export function getWorkflowSteps(
  type: WorkflowType,
  phase: string,
): WorkflowStep[] {
  const labels =
    type === "pdf"
      ? ["Processing", "Completed"]
      : ["Extracting", "Analysis", "Human review", "Completed"]
  const terminalError = ERROR_PHASES.has(phase)
  let activeIndex = 0

  if (type === "pdf") {
    activeIndex = phase === "completed" || terminalError ? 1 : 0
  } else if (phase === "analyzing" || phase === "revising") {
    activeIndex = 1
  } else if (phase === "awaiting_review") {
    activeIndex = 2
  } else if (phase === "approved" || terminalError) {
    activeIndex = 3
  }

  return labels.map((label, index) => ({
    id: label.toLowerCase().replaceAll(" ", "-"),
    label,
    state: stateForPosition(index, activeIndex, terminalError, labels.length - 1),
  }))
}

export function workflowTypeLabel(type: WorkflowType): string {
  return type === "pdf" ? "PDF extraction" : "Contract review"
}

export function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(" ")
}
