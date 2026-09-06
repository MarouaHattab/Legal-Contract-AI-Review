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
from validation import InputError, submission_fingerprint, validate_s3_pdf_uri


def _remember_pdf_workflow(workflow_id: str, fingerprint: str) -> None:
    remember_started_workflow(
        st.session_state,
        workflow_id=workflow_id,
        workflow_type="pdf",
        submission_fingerprint=fingerprint,
    )
    st.session_state["flash_message"] = (
        "PDF workflow started. Its live status is shown below."
    )
    queue_navigation(st.session_state, "Workflow Status")
    st.rerun()


def render_start_pdf() -> None:
    page_header(
        "New run / PDF",
        "Start PDF extraction",
        (
            "Upload one PDF or use an existing S3 path. The workflow writes a "
            "separate derived Markdown artifact."
        ),
    )

    upload_tab, s3_tab = st.tabs(["Upload PDF", "Use S3 path"])
    with upload_tab, st.form("upload_pdf_form", clear_on_submit=False):
        uploaded_pdf = st.file_uploader(
            "PDF file",
            type=["pdf"],
            accept_multiple_files=False,
            max_upload_size=get_streamlit_settings().upload_max_mib,
            help="The API validates the PDF before storing it in S3.",
        )
        upload_submitted = st.form_submit_button(
            "Upload and start PDF workflow",
            type="primary",
            icon=":material/upload_file:",
            width="stretch",
        )

    with s3_tab, st.form("start_pdf_s3_form", clear_on_submit=False):
        s3_path = st.text_input(
            "Source PDF",
            placeholder="s3://bucket/directory/document.pdf",
            help="Provide one S3 URI ending in .pdf.",
        )
        s3_submitted = st.form_submit_button(
            "Start PDF workflow",
            type="primary",
            icon=":material/play_arrow:",
            width="stretch",
        )

    if upload_submitted:
        try:
            prepared = prepare_uploaded_files(
                [uploaded_pdf] if uploaded_pdf is not None else [],
                max_files=1,
            )
            fingerprint = submission_fingerprint(
                "pdf_upload",
                {"files": upload_fingerprint_payload(prepared)},
            )
            if is_duplicate_submission(st.session_state, fingerprint):
                st.warning(
                    "This exact workflow was already started in this browser session.",
                    icon=":material/content_copy:",
                )
                return
            with st.spinner("Uploading the PDF and starting its workflow…"):
                client = get_api_client()
                upload_response = client.upload_pdfs(api_upload_payload(prepared))
                if len(upload_response.files) != 1:
                    raise UploadInputError(
                        "The upload service returned an unexpected file count."
                    )
                response = client.start_pdf(upload_response.files[0].s3_uri)
        except UploadInputError as exc:
            st.error(str(exc), icon=":material/error:")
        except APIClientError as exc:
            render_api_error(exc)
        else:
            _remember_pdf_workflow(response.workflow_id, fingerprint)

    if s3_submitted:
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
                _remember_pdf_workflow(response.workflow_id, fingerprint)

    last_started = st.session_state.get("last_started_workflow_id", "")
    if last_started:
        st.caption("Last workflow started in this session")
        st.code(last_started, language=None, wrap_lines=True)
        if st.button("Allow another run with the same input", key="reset_pdf_guard"):
            clear_submission_guard(st.session_state)
            st.rerun()
