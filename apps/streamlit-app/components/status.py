import streamlit as st
from models import ContractWorkflowStatus, PDFWorkflowStatus

from components.document_outcomes import render_document_progress

PHASE_DESCRIPTIONS = {
    "queued": "Accepted and waiting for workflow execution.",
    "processing": "Durable processing is in progress.",
    "extracting": "Documents are being converted to derived Markdown artifacts.",
    "analyzing": "Complete document content is being analyzed.",
    "awaiting_review": "The current report is ready for a human decision.",
    "revising": "A new report revision is being prepared from reviewer feedback.",
    "approved": "A reviewer approved the current report.",
    "completed": "The workflow completed and its result is available.",
    "timed_out": "The review window closed without human approval.",
    "revision_limit_reached": "The allowed revision count was reached without approval.",
    "cancelled": "The workflow was cancelled before completion.",
    "failed": "The workflow ended in failure.",
}


def render_phase_banner(phase: str) -> None:
    phase_label = phase.replace("_", " ").title()
    description = PHASE_DESCRIPTIONS.get(
        phase,
        "The backend reported this workflow phase.",
    )
    st.caption("Current phase")
    st.subheader(phase_label)
    st.write(description)
    st.divider()


def render_pdf_status(status: PDFWorkflowStatus) -> None:
    render_phase_banner(status.phase)
    execution, result = st.columns(2)
    execution.metric("Execution status", status.execution_status)
    result.metric("Result available", "Yes" if status.result_available else "No")


def render_contract_status(status: ContractWorkflowStatus) -> None:
    render_phase_banner(status.phase)
    execution, revision, reviewer, completeness = st.columns(4)
    execution.metric("Execution status", status.execution_status)
    revision.metric("Current revision", status.current_revision)
    reviewer.metric("Assigned reviewer", status.reviewer or "Unassigned")
    completeness.metric("Report completeness", status.completeness)
    if status.completeness == "partial":
        st.warning(
            "This report is partial because at least one document failed.",
            icon=":material/warning:",
        )
    render_document_progress(status.documents)
