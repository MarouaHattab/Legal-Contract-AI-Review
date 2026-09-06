import type { WorkflowStep } from "../features/workflows/workflowState"

type WorkflowRailProps = {
  steps: WorkflowStep[]
}

export function WorkflowRail({ steps }: WorkflowRailProps) {
  return (
    <nav aria-label="Workflow progress" className="workflow-rail">
      <ol>
        {steps.map((step, index) => (
          <li className={`rail-step rail-${step.state}`} key={step.id}>
            <span aria-hidden="true" className="rail-index">
              {index + 1}
            </span>
            <span
              aria-current={step.state === "active" ? "step" : undefined}
              className="rail-label"
              data-state={step.state}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
