from datetime import UTC

import streamlit as st
from api_client import APIClientError, APIConflictError
from components.errors import render_api_error
from components.layout import page_header
from components.results import render_contract_result, render_pdf_result
from config import get_streamlit_settings
from models import WorkflowSummary
from resources import get_api_client
from ui_state import select_workflow
from workflow_state import history_destination

WORKFLOW_TYPE_LABELS = {
    "PDF extraction": "pdf",
    "Contract review": "contract_review",
}


def _history_label(workflow: WorkflowSummary) -> str:
    workflow_type = (
        "PDF extraction" if workflow.workflow_type == "pdf" else "Contract review"
    )
    started = workflow.start_time.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"{workflow_type} / {workflow.execution_status} / {started} / "
        f"{workflow.workflow_id}"
    )


def _render_previous_runs() -> None:
    st.markdown("## Previous runs")
    st.caption(
        "Recent PDF and contract-review executions from the FastAPI visibility API."
    )
    try:
        response = get_api_client().list_workflows(
            limit=get_streamlit_settings().workflow_list_limit
        )
    except APIClientError as exc:
        render_api_error(exc)
        return

    if not response.workflows:
        st.info("No previous document workflows were found.")
        return

    rows = [
        {
            "Workflow ID": workflow.workflow_id,
            "Type": workflow.workflow_type.value,
            "Execution status": workflow.execution_status,
            "Started": workflow.start_time,
            "Closed": workflow.close_time,
        }
        for workflow in response.workflows
    ]
    st.dataframe(rows, hide_index=True, width="stretch")
    workflow_by_id = {workflow.workflow_id: workflow for workflow in response.workflows}
    selected_id = st.selectbox(
        "Select previous workflow",
        list(workflow_by_id),
        format_func=lambda workflow_id: _history_label(workflow_by_id[workflow_id]),
    )
    if st.button(
        "Open selected workflow",
        icon=":material/open_in_new:",
        width="stretch",
    ):
        workflow = workflow_by_id[selected_id]
        select_workflow(
            st.session_state,
            workflow_id=workflow.workflow_id,
            workflow_type=workflow.workflow_type.value,
        )
        st.session_state["active_page"] = history_destination(workflow.execution_status)
        st.rerun()


def render_results() -> None:
    page_header(
        "Operations / terminal outcome",
        "Results / previous runs",
        (
            "Load a terminal workflow result. Approved, timed out, revision-limited, "
            "cancelled, and failed outcomes remain distinct."
        ),
    )

    _render_previous_runs()
    st.divider()
    st.markdown("## Selected result")

    selected_type = st.session_state.get("selected_workflow_type")
    selected_label = next(
        (
            label
            for label, value in WORKFLOW_TYPE_LABELS.items()
            if value == selected_type
        ),
        "PDF extraction",
    )
    with st.form("open_result_form"):
        workflow_type_label = st.selectbox(
            "Workflow type",
            list(WORKFLOW_TYPE_LABELS),
            index=list(WORKFLOW_TYPE_LABELS).index(selected_label),
            key="result_workflow_type",
        )
        workflow_id = st.text_input(
            "Workflow ID",
            value=str(st.session_state.get("selected_workflow_id", "")),
            key="result_workflow_id",
        )
        open_result = st.form_submit_button(
            "Load result",
            type="primary",
            icon=":material/description:",
        )
    if open_result:
        normalized_id = workflow_id.strip()
        if not normalized_id:
            st.error("Enter a workflow ID.", icon=":material/error:")
            return
        select_workflow(
            st.session_state,
            workflow_id=normalized_id,
            workflow_type=WORKFLOW_TYPE_LABELS[workflow_type_label],
        )
        st.rerun()

    selected_id = str(st.session_state.get("selected_workflow_id", ""))
    selected_type = st.session_state.get("selected_workflow_type")
    if not selected_id or selected_type not in {"pdf", "contract_review"}:
        st.info(
            "Select a terminal workflow to load its result.",
            icon=":material/info:",
        )
        return

    try:
        with st.spinner("Loading the terminal result…"):
            if selected_type == "pdf":
                result = get_api_client().get_pdf_result(selected_id)
                render_pdf_result(result)
            else:
                result = get_api_client().get_contract_result(selected_id)
                render_contract_result(result)
    except APIConflictError:
        st.info(
            "The result is not available yet. Follow this workflow on Workflow Status.",
            icon=":material/hourglass_top:",
        )
    except APIClientError as exc:
        render_api_error(exc)
