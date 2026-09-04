from models import CONTRACT_TERMINAL_PHASES, PDF_TERMINAL_PHASES


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
