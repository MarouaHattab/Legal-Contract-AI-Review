import streamlit as st
from api_client import APIClientError
from components.errors import render_api_error
from components.layout import page_header
from resources import get_api_client
from ui_state import (
    clear_submission_guard,
    is_duplicate_submission,
    queue_navigation,
    remember_started_workflow,
)
from validation import InputError, submission_fingerprint, validate_s3_pdf_uri


def render_start_pdf() -> None:
    page_header(
        "New run / PDF",
        "Start PDF extraction",
        (
            "Submit one S3 PDF. The workflow writes a separate derived Markdown "
            "artifact and returns immediately with a durable workflow ID."
        ),
    )

    with st.form("start_pdf_form", clear_on_submit=False):
        s3_path = st.text_input(
            "Source PDF",
            placeholder="s3://bucket/directory/document.pdf",
            help="Provide one S3 URI ending in .pdf.",
        )
        submitted = st.form_submit_button(
            "Start PDF workflow",
            type="primary",
            icon=":material/play_arrow:",
            width="stretch",
        )

    if submitted:
        try:
            normalized_path = validate_s3_pdf_uri(s3_path)
        except InputError as exc:
            st.error(str(exc), icon=":material/error:")
            return

        fingerprint = submission_fingerprint(
            "pdf",
            {"s3_path": normalized_path},
        )
        if is_duplicate_submission(st.session_state, fingerprint):
            st.warning(
                "This exact workflow was already started in this browser session.",
                icon=":material/content_copy:",
            )
        else:
            try:
                with st.spinner("Submitting the workflow request…"):
                    response = get_api_client().start_pdf(normalized_path)
            except APIClientError as exc:
                render_api_error(exc)
            else:
                remember_started_workflow(
                    st.session_state,
                    workflow_id=response.workflow_id,
                    workflow_type="pdf",
                    submission_fingerprint=fingerprint,
                )
                st.session_state["flash_message"] = (
                    "PDF workflow started. Its live status is shown below."
                )
                queue_navigation(st.session_state, "Workflow Status")
                st.rerun()

    last_started = st.session_state.get("last_started_workflow_id", "")
    if last_started:
        st.caption("Last workflow started in this session")
        st.code(last_started, language=None, wrap_lines=True)
        if st.button("Allow another run with the same input", key="reset_pdf_guard"):
            clear_submission_guard(st.session_state)
            st.rerun()
