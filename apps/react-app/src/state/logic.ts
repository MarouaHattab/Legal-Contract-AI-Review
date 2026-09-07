import type { PipelineDocument, ReviewStep } from "../api/types";
import { REVIEW_DECISION_PHASES } from "../lib/workflow";

export const REVIEW_STEPS: ReviewStep[] = [
  "upload",
  "markdown",
  "summary",
  "decision",
];

export const REVIEW_STEP_LABELS: Record<ReviewStep, string> = {
  upload: "Upload",
  markdown: "Markdown",
  summary: "Summary",
  decision: "Review",
};

export const REVIEW_STEP_HINTS: Record<ReviewStep, string> = {
  upload: "PDFs or S3 URIs",
  markdown: "Extracted text",
  summary: "Findings and report",
  decision: "Approve or revise",
};

export type StepKind = "done" | "current" | "open" | "locked";

export function stepIndex(step: ReviewStep): number {
  return REVIEW_STEPS.indexOf(step);
}

export function adjacentStep(
  current: ReviewStep,
  direction: -1 | 1,
): ReviewStep | null {
  return REVIEW_STEPS[stepIndex(current) + direction] ?? null;
}

export function stepKind(
  step: ReviewStep,
  current: ReviewStep,
  unlocked: Set<ReviewStep>,
): StepKind {
  if (step === current) {
    return "current";
  }
  if (!unlocked.has(step)) {
    return "locked";
  }
  return stepIndex(step) < stepIndex(current) ? "done" : "open";
}

export function stepKindLabel(kind: StepKind): string {
  if (kind === "done") {
    return "Done";
  }
  if (kind === "current") {
    return "Now";
  }
  if (kind === "open") {
    return "Open";
  }
  return "Locked";
}

export function pipelineReady(documents: PipelineDocument[]): boolean {
  return (
    documents.length > 0 &&
    documents.every((item) => item.markdown_ready === "true")
  );
}

export function pipelineInProgress(documents: PipelineDocument[]): boolean {
  return documents.some(
    (item) =>
      Boolean(item.pdf_workflow_id) &&
      item.markdown_ready !== "true" &&
      !item.error,
  );
}

export function pipelineHasFailures(documents: PipelineDocument[]): boolean {
  return documents.some((item) => Boolean(item.error));
}

export function unlockedReviewSteps(
  documents: PipelineDocument[],
  contractWorkflowId: string,
  contractPhase: string,
): Set<ReviewStep> {
  const unlocked = new Set<ReviewStep>(["upload"]);
  if (documents.length) {
    unlocked.add("markdown");
  }
  if (contractWorkflowId || pipelineReady(documents)) {
    unlocked.add("summary");
  }
  if (REVIEW_DECISION_PHASES.has(contractPhase)) {
    unlocked.add("decision");
  }
  return unlocked;
}

export function normalizeReviewStep(
  current: ReviewStep,
  unlocked: Set<ReviewStep>,
  documents: PipelineDocument[],
  contractWorkflowId: string,
): ReviewStep {
  if (
    current === "upload" &&
    contractWorkflowId &&
    documents.length === 0 &&
    unlocked.has("summary")
  ) {
    return unlocked.has("decision") ? "decision" : "summary";
  }
  if (unlocked.has(current)) {
    return current;
  }
  for (const step of [...REVIEW_STEPS].reverse()) {
    if (unlocked.has(step)) {
      return step;
    }
  }
  return "upload";
}
