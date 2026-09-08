import assert from "node:assert/strict";
import test from "node:test";
import * as workflow from "./workflow.ts";

test("classifies only live Temporal executions as active", () => {
  assert.equal(typeof workflow.executionIsActive, "function");
  assert.equal(workflow.executionIsActive("RUNNING"), true);
  assert.equal(workflow.executionIsActive("running"), true);
  assert.equal(workflow.executionIsActive("COMPLETED"), false);
  assert.equal(workflow.executionIsActive("FAILED"), false);
  assert.equal(workflow.executionIsActive("TERMINATED"), false);
});

test("treats all result-bearing and known final phases as terminal", () => {
  assert.equal(workflow.workflowIsTerminal("pdf", "processing", false), false);
  assert.equal(workflow.workflowIsTerminal("pdf", "completed", false), true);
  assert.equal(
    workflow.workflowIsTerminal("contract_review", "awaiting_review", false),
    false,
  );
  assert.equal(
    workflow.workflowIsTerminal("contract_review", "approved", false),
    true,
  );
  assert.equal(
    workflow.workflowIsTerminal("contract_review", "unknown", true),
    true,
  );
});

test("keeps a terminal workflow view syncing until its result is loaded", () => {
  assert.equal(
    workflow.workflowViewIsSettled(
      "contract_review",
      "approved",
      false,
      false,
    ),
    false,
  );
  assert.equal(
    workflow.workflowViewIsSettled(
      "contract_review",
      "approved",
      true,
      false,
    ),
    false,
  );
  assert.equal(
    workflow.workflowViewIsSettled(
      "contract_review",
      "approved",
      true,
      true,
    ),
    true,
  );
});

test("gives every inspected workflow instance a distinct monitor key", () => {
  assert.equal(
    workflow.workflowSelectionKey("pdf", "shared-id"),
    "pdf:shared-id",
  );
  assert.equal(
    workflow.workflowSelectionKey("contract_review", "shared-id"),
    "contract_review:shared-id",
  );
  assert.notEqual(
    workflow.workflowSelectionKey("pdf", "first"),
    workflow.workflowSelectionKey("pdf", "second"),
  );
});

test("maps execution outcomes to consistent dashboard labels and tones", () => {
  assert.deepEqual(workflow.executionPresentation("RUNNING"), {
    label: "Running",
    tone: "run",
  });
  assert.deepEqual(workflow.executionPresentation("COMPLETED"), {
    label: "Completed",
    tone: "ok",
  });
  assert.deepEqual(workflow.executionPresentation("FAILED"), {
    label: "Failed",
    tone: "err",
  });
  assert.deepEqual(workflow.executionPresentation("TERMINATED"), {
    label: "Cancelled",
    tone: "warn",
  });
});

test("summarizes workflow records for dashboard decisions", () => {
  const records = [
    { execution_status: "RUNNING" },
    { execution_status: "COMPLETED" },
    { execution_status: "COMPLETED" },
    { execution_status: "FAILED" },
    { execution_status: "TERMINATED" },
  ];

  assert.deepEqual(workflow.summarizeExecutions(records), {
    total: 5,
    active: 1,
    completed: 2,
    attention: 2,
  });
});

test("formats recent workflow times without exposing raw ISO strings", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  assert.equal(
    workflow.relativeWorkflowTime("2026-09-07T11:59:40.000Z", now),
    "Just now",
  );
  assert.equal(
    workflow.relativeWorkflowTime("2026-09-07T11:55:00.000Z", now),
    "5 min ago",
  );
  assert.equal(
    workflow.relativeWorkflowTime("2026-09-07T09:00:00.000Z", now),
    "3 hr ago",
  );
  assert.equal(workflow.relativeWorkflowTime("not-a-date", now), "Unknown");
});

test("maps contract phases onto the three-stage evidence progress rail", () => {
  assert.deepEqual(workflow.contractProgress("extracting"), {
    activeIndex: 0,
    title: "Summarizing evidence",
  });
  assert.deepEqual(workflow.contractProgress("analyzing"), {
    activeIndex: 1,
    title: "Writing consolidated report",
  });
  assert.deepEqual(workflow.contractProgress("revising"), {
    activeIndex: 1,
    title: "Revising report",
  });
  assert.deepEqual(workflow.contractProgress("awaiting_review"), {
    activeIndex: 2,
    title: "Ready for human review",
  });
});
