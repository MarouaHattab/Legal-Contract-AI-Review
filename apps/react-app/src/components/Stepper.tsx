import type { ReviewStep } from "../api/types";
import {
  REVIEW_STEP_HINTS,
  REVIEW_STEP_LABELS,
  REVIEW_STEPS,
  stepIndex,
  stepKind,
} from "../state/logic";

export function Stepper({
  current,
  unlocked,
  onSelect,
}: {
  current: ReviewStep;
  unlocked: Set<ReviewStep>;
  onSelect: (step: ReviewStep) => void;
}) {
  const fill = (stepIndex(current) / (REVIEW_STEPS.length - 1)) * 100;

  return (
    <div className="stepper-wrap">
      <div className="stepper-line">
        <div className="stepper-line-fill" style={{ width: `${fill}%` }} />
      </div>
      <ol className="stepper">
        {REVIEW_STEPS.map((step, index) => {
          const kind = stepKind(step, current, unlocked);
          return (
            <li key={step} className={kind}>
              <button
                type="button"
                disabled={kind === "locked"}
                aria-current={kind === "current" ? "step" : undefined}
                onClick={() => onSelect(step)}
              >
                <span className="node">{index + 1}</span>
                <span className="name">{REVIEW_STEP_LABELS[step]}</span>
                <span className="hint">{REVIEW_STEP_HINTS[step]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
