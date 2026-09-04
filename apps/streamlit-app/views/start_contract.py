import streamlit as st
from api_client import APIClientError
from components.errors import render_api_error
from components.layout import page_header
from resources import get_api_client
from ui_state import (
    clear_submission_guard,
    is_duplicate_submission,
    remember_started_workflow,
)
from validation import InputError, parse_contract_paths, submission_fingerprint


def render_start_contract() -> None:
    page_header(
        "New run / contract review",
        "Start contract review",
        (
            "Submit up to 20 S3 PDFs for complete-document analysis and a "
            "revision-aware human approval step."
        ),
    )

    with st.form("start_contract_form", clear_on_submit=False):
        s3_paths_text = st.text_area(
            "Contract PDFs",
            placeholder="One s3://bucket/directory/document.pdf URI per line",
            height=180,
            help="Blank lines are ignored. Duplicate documents are rejected.",
        )
        max_revisions = st.number_input(
            "Maximum report revisions",
            min_value=0,
            max_value=10,
            value=2,
            step=1,
            help="Approval is no longer possible after this limit is reached.",
        )
        submitted = st.form_submit_button(
            "Start contract review",
            type="primary",
            icon=":material/play_arrow:",
            use_container_width=True,
        )

    if submitted:
        try:
            s3_paths = parse_contract_paths(s3_paths_text)
        except InputError as exc:
            st.error(str(exc), icon=":material/error:")
            return

        payload = {"s3_paths": s3_paths, "max_revisions": int(max_revisions)}
        fingerprint = submission_fingerprint("contract_review", payload)
        if is_duplicate_submission(st.session_state, fingerprint):
            st.warning(
                "This exact workflow was already started in this browser session.",
                icon=":material/content_copy:",
            )
        else:
            try:
                with st.spinner("Submitting the workflow request…"):
                    response = get_api_client().start_contract_review(
                        s3_paths,
                        max_revisions=int(max_revisions),
                    )
            except APIClientError as exc:
                render_api_error(exc)
            else:
                remember_started_workflow(
                    st.session_state,
                    workflow_id=response.workflow_id,
                    workflow_type="contract_review",
                    submission_fingerprint=fingerprint,
                )
                st.session_state["flash_message"] = (
                    "Contract review started. Its live status is shown below."
                )
                st.session_state["active_page"] = "Workflow Status"
                st.rerun()

    last_started = st.session_state.get("last_started_workflow_id", "")
    if last_started:
        st.caption("Last workflow started in this session")
        st.code(last_started, language=None, wrap_lines=True)
        if st.button(
            "Allow another run with the same input", key="reset_contract_guard"
        ):
            clear_submission_guard(st.session_state)
            st.rerun()
