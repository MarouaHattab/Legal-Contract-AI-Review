from dataclasses import dataclass
from typing import Literal

from models import CONTRACT_TERMINAL_PHASES, PDF_TERMINAL_PHASES


@dataclass(frozen=True)
class TerminalPresentation:
    level: Literal["success", "warning", "error"]
    title: str
    message: str


TERMINAL_PRESENTATIONS = {
    ("pdf", "completed"): TerminalPresentation(
        "success",
        "PDF processing completed",
        "The derived Markdown artifact is available.",
    ),
    ("pdf", "timed_out"): TerminalPresentation(
        "warning",
        "PDF processing timed out",
        "The workflow timed out before an artifact was produced.",
    ),
    ("pdf", "cancelled"): TerminalPresentation(
        "warning",
        "PDF processing cancelled",
        "The workflow was cancelled before an artifact was produced.",
    ),
    ("pdf", "failed"): TerminalPresentation(
        "error",
        "PDF processing failed",
        "The workflow failed before an artifact was produced.",
    ),
    ("contract_review", "approved"): TerminalPresentation(
        "success",
        "Contract report approved",
        "The assigned reviewer approved the final report.",
    ),
    ("contract_review", "timed_out"): TerminalPresentation(
        "warning",
        "Human review timed out",
        "The review window ended without human approval.",
    ),
    ("contract_review", "revision_limit_reached"): TerminalPresentation(
        "warning",
        "Revision limit reached",
        "The latest report is available, but approval was not reached.",
    ),
    ("contract_review", "cancelled"): TerminalPresentation(
        "warning",
        "Contract review cancelled",
        "The workflow was cancelled before approval.",
    ),
    ("contract_review", "failed"): TerminalPresentation(
        "error",
        "Contract review failed",
        "The workflow failed before reaching an approved outcome.",
    ),
}


def workflow_is_terminal(
    workflow_type: str,
    *,
    phase: str,
    result_available: bool,
) -> bool:
    if result_available:
        return True
    terminal_phases = (
        PDF_TERMINAL_PHASES if workflow_type == "pdf" else CONTRACT_TERMINAL_PHASES
    )
    return phase in terminal_phases


def terminal_presentation(
    workflow_type: str,
    final_status: str,
) -> TerminalPresentation:
    return TERMINAL_PRESENTATIONS.get(
        (workflow_type, final_status),
        TerminalPresentation(
            "error",
            "Unexpected terminal outcome",
            "The backend returned an unrecognized terminal state.",
        ),
    )


def history_destination(execution_status: str) -> str:
    if execution_status.upper() == "RUNNING":
        return "Workflow Status"
    return "Results / Previous Runs"
