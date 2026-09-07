import { executionPresentation } from "../lib/workflow";

export function WorkflowStatusBadge({ status }: { status: string }) {
  const presentation = executionPresentation(status);
  return (
    <span className={`workflow-badge ${presentation.tone}`}>
      <span className="workflow-badge-dot" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
