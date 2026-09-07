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
