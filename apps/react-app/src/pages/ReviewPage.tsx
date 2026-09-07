import { useEffect } from "react";
import { Flash } from "../components/Flash";
import { Stepper } from "../components/Stepper";
import { useContractPhase } from "../hooks/useContractPhase";
import { DecisionStep } from "../steps/DecisionStep";
import { MarkdownStep } from "../steps/MarkdownStep";
import { SummaryStep } from "../steps/SummaryStep";
import { UploadStep } from "../steps/UploadStep";
import {
  adjacentStep,
  normalizeReviewStep,
  stepIndex,
  unlockedReviewSteps,
} from "../state/logic";
import { useStore } from "../state/store";

export function ReviewPage() {
  const { state, setReviewStep } = useStore();
  const phase = useContractPhase(state.contractWorkflowId);
  const unlocked = unlockedReviewSteps(
    state.documents,
    state.contractWorkflowId,
    phase,
  );
  const current = normalizeReviewStep(
    state.reviewStep,
    unlocked,
    state.documents,
    state.contractWorkflowId,
  );
  const previous = adjacentStep(current, -1);
  const canGoBack = Boolean(previous && unlocked.has(previous));
  const count = state.documents.length;

  useEffect(() => {
    if (current !== state.reviewStep) {
      setReviewStep(current);
    }
  }, [current, setReviewStep, state.reviewStep]);

  function goBack() {
    if (previous && unlocked.has(previous)) {
      setReviewStep(previous);
    }
  }

  return (
    <>
      <h1 className="page-title">Contract review</h1>
      <p className="page-meta">
        <span>FastAPI</span>
        <span>Temporal</span>
        <span>
          {count} {count === 1 ? "document" : "documents"}
        </span>
        <span>Step {stepIndex(current) + 1} of 4</span>
      </p>
      <Flash />
      <Stepper current={current} unlocked={unlocked} onSelect={setReviewStep} />
      {current === "upload" ? (
        <UploadStep onContinue={() => setReviewStep("markdown")} />
      ) : null}
      {current === "markdown" ? (
        <MarkdownStep
          onBack={goBack}
          onSummary={() => setReviewStep("summary")}
        />
      ) : null}
      {current === "summary" ? (
        <SummaryStep
          onBack={goBack}
          onReview={() => setReviewStep("decision")}
        />
      ) : null}
      {current === "decision" ? (
        <DecisionStep onBack={canGoBack ? goBack : undefined} />
      ) : null}
    </>
  );
}
