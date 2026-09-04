import streamlit as st
from models import ContractReviewResult, PDFWorkflowResult
from workflow_state import terminal_presentation

from components.document_outcomes import render_document_outcomes
from components.report import render_contract_report


def format_bytes(size_bytes: int) -> str:
    if size_bytes < 1_024:
        return f"{size_bytes} B"
    if size_bytes < 1_024**2:
        return f"{size_bytes / 1_024:.1f} KiB"
    return f"{size_bytes / (1_024**2):.1f} MiB"


def render_terminal_banner(workflow_type: str, final_status: str) -> None:
    presentation = terminal_presentation(workflow_type, final_status)
    message = f"**{presentation.title}** — {presentation.message}"
    if presentation.level == "success":
        st.success(message, icon=":material/check_circle:")
    elif presentation.level == "warning":
        st.warning(message, icon=":material/warning:")
    else:
        st.error(message, icon=":material/error:")


def render_pdf_result(result: PDFWorkflowResult) -> None:
    render_terminal_banner("pdf", result.final_status)
    if result.error:
        st.error(result.error, icon=":material/error:")
    if result.result is None:
        return

    artifact = result.result
    output, size, content_type = st.columns([2, 1, 1])
    output.metric("Artifact", "Markdown")
    size.metric("Size", format_bytes(artifact.size_bytes))
    content_type.metric("Content type", artifact.content_type)
    st.caption("Derived output")
    st.code(artifact.output_s3_path, language=None, wrap_lines=True)
    with st.expander("Artifact integrity"):
        st.caption("SHA-256")
        st.code(artifact.sha256, language=None, wrap_lines=True)


def render_contract_result(result: ContractReviewResult) -> None:
    render_terminal_banner("contract_review", result.final_status)
    if result.completeness == "partial":
        st.warning(
            "Partial result: one or more documents failed. Review the outcomes below.",
            icon=":material/warning:",
        )
    if result.error:
        st.error(result.error, icon=":material/error:")

    execution, reviewer, revisions, completeness = st.columns(4)
    execution.metric("Execution status", result.execution_status)
    reviewer.metric("Assigned reviewer", result.reviewer or "Unassigned")
    revisions.metric("Revision count", result.revision_count)
    completeness.metric("Report completeness", result.completeness)
    render_contract_report(result.report, title="Final report")
    render_document_outcomes(result.documents)
