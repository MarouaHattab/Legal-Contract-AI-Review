import streamlit as st
from api_client import APIClientError
from components.errors import render_api_error
from components.layout import page_header
from config import get_streamlit_settings
from resources import get_api_client
from ui_state import (
    clear_submission_guard,
    is_duplicate_submission,
    queue_navigation,
    remember_started_workflow,
)
from upload_inputs import (
    UploadInputError,
    api_upload_payload,
    prepare_uploaded_files,
    upload_fingerprint_payload,
)
from validation import InputError, parse_contract_paths, submission_fingerprint


def _remember_contract_workflow(workflow_id: str, fingerprint: str) -> None:
    remember_started_workflow(
        st.session_state,
        workflow_id=workflow_id,
        workflow_type="contract_review",
        submission_fingerprint=fingerprint,
    )
    st.session_state["flash_message"] = (
        "Contract review started. Its live status is shown below."
    )
    queue_navigation(st.session_state, "Workflow Status")
    st.rerun()


def render_start_contract() -> None:
    page_header(
        "New run / contract review",
        "Start contract review",
        (
            "Upload up to 20 PDFs or use existing S3 paths for complete-document "
            "analysis and a revision-aware human approval step."
        ),
    )

    max_revisions = st.number_input(
        "Maximum report revisions",
        min_value=0,
        max_value=10,
        value=2,
        step=1,
        help="Approval is no longer possible after this limit is reached.",
    )
    upload_tab, s3_tab = st.tabs(["Upload PDFs", "Use S3 paths"])
    with upload_tab, st.form("upload_contract_form", clear_on_submit=False):
        uploaded_pdfs = st.file_uploader(
            "Contract PDF files",
            type=["pdf"],
            accept_multiple_files=True,
            max_upload_size=get_streamlit_settings().upload_max_mib,
            help="Select between 1 and 20 PDFs. All files are validated first.",
        )
        upload_submitted = st.form_submit_button(
            "Upload and start contract review",
            type="primary",
            icon=":material/upload_file:",
            width="stretch",
        )

    with s3_tab, st.form("start_contract_s3_form", clear_on_submit=False):
        s3_paths_text = st.text_area(
            "Contract PDFs",
            placeholder="One s3://bucket/directory/document.pdf URI per line",
            height=180,
            help="Blank lines are ignored. Duplicate documents are rejected.",
        )
        s3_submitted = st.form_submit_button(
            "Start contract review",
            type="primary",
            icon=":material/play_arrow:",
            width="stretch",
        )

    if upload_submitted:
        try:
            prepared = prepare_uploaded_files(uploaded_pdfs or [], max_files=20)
            payload = {
                "files": upload_fingerprint_payload(prepared),
                "max_revisions": int(max_revisions),
            }
            fingerprint = submission_fingerprint("contract_review_upload", payload)
            if is_duplicate_submission(st.session_state, fingerprint):
                st.warning(
                    "This exact workflow was already started in this browser session.",
                    icon=":material/content_copy:",
                )
                return
            with st.spinner("Uploading PDFs and starting contract review…"):
                client = get_api_client()
                upload_response = client.upload_pdfs(api_upload_payload(prepared))
                if len(upload_response.files) != len(prepared):
                    raise UploadInputError(
                        "The upload service returned an unexpected file count."
                    )
                response = client.start_contract_review(
                    [file.s3_uri for file in upload_response.files],
                    max_revisions=int(max_revisions),
                )
        except UploadInputError as exc:
            st.error(str(exc), icon=":material/error:")
        except APIClientError as exc:
            render_api_error(exc)
        else:
            _remember_contract_workflow(response.workflow_id, fingerprint)

    if s3_submitted:
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
                _remember_contract_workflow(response.workflow_id, fingerprint)

    last_started = st.session_state.get("last_started_workflow_id", "")
    if last_started:
        st.caption("Last workflow started in this session")
        st.code(last_started, language=None, wrap_lines=True)
        if st.button(
            "Allow another run with the same input", key="reset_contract_guard"
        ):
            clear_submission_guard(st.session_state)
            st.rerun()
