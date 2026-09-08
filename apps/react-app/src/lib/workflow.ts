import type { WorkflowType } from "../api/types";

export const PDF_TERMINAL_PHASES = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export const CONTRACT_TERMINAL_PHASES = new Set([
  "approved",
  "timed_out",
  "revision_limit_reached",
  "cancelled",
  "failed",
]);

export const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Converting to Markdown",
  extracting: "Summarizing Markdown",
  analyzing: "Writing report",
  awaiting_review: "Awaiting review",
  revising: "Revising report",
  approved: "Approved",
  completed: "Completed",
  timed_out: "Timed out",
  revision_limit_reached: "Revision limit reached",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function phaseTone(
  phase: string,
): "ready" | "run" | "ok" | "warn" | "err" {
  if (phase === "awaiting_review") {
    return "ready";
  }
  if (phase === "approved" || phase === "completed") {
    return "ok";
  }
  if (
    phase === "timed_out" ||
    phase === "revision_limit_reached" ||
    phase === "cancelled"
  ) {
    return "warn";
  }
  if (phase === "failed") {
    return "err";
  }
  return "run";
}

export const PHASE_DESCRIPTIONS: Record<string, string> = {
  queued: "Accepted and waiting for a worker.",
  processing: "Durable PDF processing is in progress.",
  extracting:
    "The Markdown from the previous step is being summarized. The PDF is not extracted again.",
  analyzing:
    "Document summaries are ready. The cross-contract report is being written.",
  awaiting_review: "A report is ready for a human decision.",
  revising: "A new report is being generated from reviewer feedback.",
  approved: "A reviewer approved the current report.",
  completed: "The workflow completed and its result is available.",
  timed_out: "The review window closed without human approval.",
  revision_limit_reached:
    "The allowed revision count was reached without approval.",
  cancelled: "The workflow was cancelled before completion.",
  failed: "The workflow ended in failure.",
};

const PHASE_TO_UI: Record<string, string> = {
  queued: "Pending",
  processing: "Running",
  extracting: "Running",
  analyzing: "Running",
  awaiting_review: "Awaiting Review",
  revising: "Revising",
  approved: "Completed",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  timed_out: "Timed Out",
  revision_limit_reached: "Revision Limit Reached",
};

const EXECUTION_TO_UI: Record<string, string> = {
  RUNNING: "Running",
  COMPLETED: "Completed",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  TERMINATED: "Cancelled",
  TIMED_OUT: "Timed Out",
};

export type WorkflowTone = "run" | "ok" | "warn" | "err";

const EXECUTION_PRESENTATION: Record<
  string,
  { label: string; tone: WorkflowTone }
> = {
  RUNNING: { label: "Running", tone: "run" },
  COMPLETED: { label: "Completed", tone: "ok" },
  CANCELED: { label: "Cancelled", tone: "warn" },
  CANCELLED: { label: "Cancelled", tone: "warn" },
  TERMINATED: { label: "Cancelled", tone: "warn" },
  TIMED_OUT: { label: "Timed out", tone: "warn" },
  FAILED: { label: "Failed", tone: "err" },
};

export function executionIsActive(executionStatus: string): boolean {
  return executionStatus.toUpperCase() === "RUNNING";
}

export function executionPresentation(executionStatus: string): {
  label: string;
  tone: WorkflowTone;
} {
  return (
    EXECUTION_PRESENTATION[executionStatus.toUpperCase()] ?? {
      label: executionStatus || "Unknown",
      tone: "warn",
    }
  );
}

export type ExecutionFilter = "all" | "active" | "completed" | "attention";

export function executionCategory(
  executionStatus: string,
): Exclude<ExecutionFilter, "all"> {
  const presentation = executionPresentation(executionStatus);
  if (presentation.tone === "run") {
    return "active";
  }
  if (presentation.tone === "ok") {
    return "completed";
  }
  return "attention";
}

export function summarizeExecutions(
  records: ReadonlyArray<{ execution_status: string }>,
): { total: number; active: number; completed: number; attention: number } {
  return records.reduce(
    (summary, record) => {
      summary.total += 1;
      summary[executionCategory(record.execution_status)] += 1;
      return summary;
    },
    { total: 0, active: 0, completed: 0, attention: 0 },
  );
}

export function relativeWorkflowTime(
  value: string,
  now = Date.now(),
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(timestamp).getFullYear() === new Date(now).getFullYear()
      ? undefined
      : "numeric",
  }).format(new Date(timestamp));
}

export function contractProgress(phase: string): {
  activeIndex: number;
  title: string;
} {
  if (phase === "analyzing") {
    return { activeIndex: 1, title: "Writing consolidated report" };
  }
  if (phase === "revising") {
    return { activeIndex: 1, title: "Revising report" };
  }
  if (phase === "awaiting_review") {
    return { activeIndex: 2, title: "Ready for human review" };
  }
  if (CONTRACT_TERMINAL_PHASES.has(phase)) {
    return { activeIndex: 2, title: phaseLabel(phase) };
  }
  if (phase === "queued" || !phase) {
    return { activeIndex: 0, title: "Preparing evidence" };
  }
  return { activeIndex: 0, title: "Summarizing evidence" };
}

export function workflowIsTerminal(
  workflowType: WorkflowType,
  phase: string,
  resultAvailable: boolean,
): boolean {
  if (resultAvailable) {
    return true;
  }
  return (workflowType === "pdf" ? PDF_TERMINAL_PHASES : CONTRACT_TERMINAL_PHASES)
    .has(phase);
}

export function workflowViewIsSettled(
  workflowType: WorkflowType,
  phase: string,
  resultAvailable: boolean,
  resultLoaded: boolean,
): boolean {
  return (
    resultLoaded && workflowIsTerminal(workflowType, phase, resultAvailable)
  );
}

export function uiStatus(
  phase: string,
  executionStatus: string,
  resultAvailable = false,
): string {
  if (PHASE_TO_UI[phase]) {
    return PHASE_TO_UI[phase];
  }
  if (resultAvailable) {
    return EXECUTION_TO_UI[executionStatus.toUpperCase()] ?? "Completed";
  }
  return EXECUTION_TO_UI[executionStatus.toUpperCase()] ?? "Running";
}

export function workflowTypeLabel(workflowType: string): string {
  if (workflowType === "pdf") {
    return "PDF processing";
  }
  if (workflowType === "contract_review") {
    return "Contract review";
  }
  return workflowType;
}

export function workflowSelectionKey(
  workflowType: WorkflowType,
  workflowId: string,
): string {
  return `${workflowType}:${workflowId}`;
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replaceAll("_", " ");
}

export function phaseDescription(phase: string, fallback = ""): string {
  return PHASE_DESCRIPTIONS[phase] ?? fallback;
}

export interface TerminalPresentation {
  level: "success" | "warning" | "error";
  title: string;
  message: string;
}

const TERMINAL: Record<string, TerminalPresentation> = {
  "pdf:completed": {
    level: "success",
    title: "PDF processing completed",
    message: "The derived Markdown artifact is available.",
  },
  "pdf:timed_out": {
    level: "warning",
    title: "PDF processing timed out",
    message: "The workflow timed out before an artifact was produced.",
  },
  "pdf:cancelled": {
    level: "warning",
    title: "PDF processing cancelled",
    message: "The workflow was cancelled before an artifact was produced.",
  },
  "pdf:failed": {
    level: "error",
    title: "PDF processing failed",
    message: "The workflow failed before an artifact was produced.",
  },
  "contract_review:approved": {
    level: "success",
    title: "Contract report approved",
    message: "The assigned reviewer approved the final report.",
  },
  "contract_review:timed_out": {
    level: "warning",
    title: "Human review timed out",
    message: "The review window ended without human approval.",
  },
  "contract_review:revision_limit_reached": {
    level: "warning",
    title: "Revision limit reached",
    message: "The latest report is available, but approval was not reached.",
  },
  "contract_review:cancelled": {
    level: "warning",
    title: "Contract review cancelled",
    message: "The workflow was cancelled before approval.",
  },
  "contract_review:failed": {
    level: "error",
    title: "Contract review failed",
    message: "The workflow failed before reaching an approved outcome.",
  },
};

export function terminalPresentation(
  workflowType: string,
  finalStatus: string,
): TerminalPresentation {
  return (
    TERMINAL[`${workflowType}:${finalStatus}`] ?? {
      level: "error",
      title: "Unexpected terminal outcome",
      message: "The backend returned an unrecognized terminal state.",
    }
  );
}

export const REVIEW_DECISION_PHASES = new Set([
  "awaiting_review",
  "revising",
  "approved",
  "revision_limit_reached",
  "timed_out",
]);

export const GENERATING_PHASES = new Set([
  "queued",
  "extracting",
  "analyzing",
  "revising",
]);
