import streamlit as st
from api_client import APIClientError
from components.errors import render_api_error
from components.layout import page_header
from components.status import render_contract_status, render_pdf_status
from config import get_streamlit_settings
from resources import get_api_client
from ui_state import select_workflow
from workflow_state import workflow_is_terminal

WORKFLOW_TYPE_LABELS = {
    "PDF extraction": "pdf",
    "Contract review": "contract_review",
}


def _render_live_status(workflow_id: str, workflow_type: str) -> None:
    settings = get_streamlit_settings()
    workflow_key = f"{workflow_type}:{workflow_id}"
    polling_stopped = st.session_state.get("polling_stopped_for") == workflow_key
    interval = None if polling_stopped else settings.poll_interval_seconds

    @st.fragment(run_every=interval)
    def live_status() -> None:
        try:
            if workflow_type == "pdf":
                status = get_api_client().get_pdf_status(workflow_id)
                render_pdf_status(status)
            else:
                status = get_api_client().get_contract_status(workflow_id)
                st.session_state["latest_known_revision"] = status.current_revision
                render_contract_status(status)
        except APIClientError as exc:
            render_api_error(exc)
            return

        terminal = workflow_is_terminal(
            workflow_type,
            phase=status.phase,
            result_available=status.result_available,
        )
        if terminal:
            st.caption("Terminal state reached. Automatic polling is stopped.")
            if not polling_stopped:
                st.session_state["polling_stopped_for"] = workflow_key
                st.rerun()
        else:
            st.caption(
                f"Refreshing every {settings.poll_interval_seconds:g} seconds "
                "while this workflow is active."
            )

        if (
            workflow_type == "contract_review"
            and status.phase == "awaiting_review"
            and st.button(
                "Open human review",
                key=f"open_review_{workflow_key}",
                type="primary",
                icon=":material/rate_review:",
            )
        ):
            st.session_state["active_page"] = "Human Review"
            st.rerun()

        if status.result_available and st.button(
            "Open result",
            key=f"open_result_{workflow_key}",
            icon=":material/description:",
        ):
            st.session_state["active_page"] = "Results"
            st.rerun()

        if st.button(
            "Refresh now",
            key=f"refresh_status_{workflow_key}",
            icon=":material/refresh:",
        ):
            st.rerun(scope="fragment")

    live_status()


def render_workflow_status() -> None:
    page_header(
        "Operations / live state",
        "Workflow status",
        (
            "Inspect the latest application-level phase. Polling runs only while "
            "the selected workflow is active."
        ),
    )

    flash_message = st.session_state.get("flash_message", "")
    if flash_message:
        st.success(flash_message, icon=":material/check_circle:")
        st.session_state["flash_message"] = ""

    selected_type = st.session_state.get("selected_workflow_type")
    selected_label = next(
        (
            label
            for label, value in WORKFLOW_TYPE_LABELS.items()
            if value == selected_type
        ),
        "PDF extraction",
    )
    with st.form("open_workflow_form"):
        workflow_type_label = st.selectbox(
            "Workflow type",
            list(WORKFLOW_TYPE_LABELS),
            index=list(WORKFLOW_TYPE_LABELS).index(selected_label),
        )
        workflow_id = st.text_input(
            "Workflow ID",
            value=str(st.session_state.get("selected_workflow_id", "")),
        )
        open_workflow = st.form_submit_button(
            "Open workflow",
            type="primary",
            icon=":material/search:",
        )

    if open_workflow:
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
            "Start a workflow or enter an existing workflow ID to view its state.",
            icon=":material/info:",
        )
        return

    st.caption("Selected workflow")
    st.code(selected_id, language=None, wrap_lines=True)
    _render_live_status(selected_id, str(selected_type))
