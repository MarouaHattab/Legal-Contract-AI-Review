from typing import Literal

import streamlit as st
from api_client import APIClientError, APIConflictError
from components.document_outcomes import render_document_outcomes
from components.errors import render_api_error
from components.layout import page_header
from components.report import render_contract_report
from components.status import render_contract_status
from resources import get_api_client
from review_actions import ReviewStateChanged, guarded_submit_review
from ui_state import select_workflow
from validation import submission_fingerprint


def _set_review_notice(level: str, message: str) -> None:
    st.session_state["review_notice"] = {"level": level, "message": message}


def _render_review_notice() -> None:
    notice = st.session_state.get("review_notice")
    if not isinstance(notice, dict):
        return
    message = str(notice.get("message", ""))
    if notice.get("level") == "success":
        st.success(message, icon=":material/check_circle:")
    else:
        st.warning(message, icon=":material/sync_problem:")
    st.session_state["review_notice"] = None


def _handle_stale_review(workflow_id: str) -> None:
    try:
        latest_status = get_api_client().get_contract_status(workflow_id)
    except APIClientError:
        latest_status = None
    if latest_status is not None:
        st.session_state["latest_known_revision"] = latest_status.current_revision
    _set_review_notice(
        "warning",
        (
            "The review state changed. The latest report and revision have been "
            "reloaded; review them before submitting another decision."
        ),
    )
    st.rerun()


def _submit_decision(
    workflow_id: str,
    *,
    decision: Literal["approve", "revise"],
    expected_revision: int,
    feedback: str = "",
) -> None:
    token = submission_fingerprint(
        "review",
        {
            "workflow_id": workflow_id,
            "decision": decision,
            "expected_revision": expected_revision,
            "feedback": feedback,
        },
    )
    if st.session_state.get("last_review_submission") == token:
        st.warning(
            "This review action was already submitted in this browser session.",
            icon=":material/content_copy:",
        )
        return

    try:
        with st.spinner("Checking the latest review state…"):
            response = guarded_submit_review(
                get_api_client(),
                workflow_id=workflow_id,
                decision=decision,
                expected_revision=expected_revision,
                feedback=feedback,
            )
    except (ReviewStateChanged, APIConflictError):
        _handle_stale_review(workflow_id)
    except APIClientError as exc:
        render_api_error(exc)
    else:
        st.session_state["last_review_submission"] = token
        st.session_state["polling_stopped_for"] = ""
        st.session_state["flash_message"] = response.message
        st.session_state["active_page"] = "Workflow Status"
        st.rerun()


def _render_assignment(workflow_id: str, reviewer: str) -> None:
    st.markdown("## Reviewer assignment")
    st.caption(
        "This is a manually entered assignment label, not an authenticated identity."
    )
    with st.form("assign_reviewer_form"):
        reviewer_name = st.text_input(
            "Assigned reviewer",
            value=reviewer,
            max_chars=200,
        )
        assign = st.form_submit_button(
            "Update assignment",
            icon=":material/person_edit:",
        )

    if not assign:
        return
    if not reviewer_name.strip():
        st.error("Enter a reviewer name.", icon=":material/error:")
        return
    try:
        response = get_api_client().assign_reviewer(
            workflow_id,
            reviewer_name.strip(),
        )
    except APIClientError as exc:
        render_api_error(exc)
    else:
        _set_review_notice("success", response.message)
        st.rerun()


def _render_decisions(workflow_id: str, revision: int, reviewer: str) -> None:
    st.markdown("## Decision")
    if not reviewer:
        st.info(
            "Assign a reviewer before submitting a decision.",
            icon=":material/person_alert:",
        )

    approve_column, revise_column = st.columns(2, gap="large")
    with approve_column:
        st.markdown("### Approve")
        st.write("Accept the report at the revision shown above.")
        with st.form("approve_report_form"):
            approve = st.form_submit_button(
                "Approve this revision",
                type="primary",
                icon=":material/check:",
                disabled=not reviewer,
                use_container_width=True,
            )
        if approve:
            _submit_decision(
                workflow_id,
                decision="approve",
                expected_revision=revision,
            )

    with revise_column:
        st.markdown("### Request revision")
        with st.form("revise_report_form"):
            feedback = st.text_area(
                "Required feedback",
                placeholder="Describe the specific changes required in the next report.",
                max_chars=10_000,
            )
            revise = st.form_submit_button(
                "Request revision",
                icon=":material/rate_review:",
                disabled=not reviewer,
                use_container_width=True,
            )
        if revise:
            normalized_feedback = feedback.strip()
            if not normalized_feedback:
                st.error(
                    "Feedback is required when requesting a revision.",
                    icon=":material/error:",
                )
            else:
                _submit_decision(
                    workflow_id,
                    decision="revise",
                    expected_revision=revision,
                    feedback=normalized_feedback,
                )


def render_human_review() -> None:
    page_header(
        "Human-in-the-loop / review",
        "Human review",
        (
            "Inspect the current draft and document evidence before assigning a "
            "reviewer or making a revision-aware decision."
        ),
    )
    _render_review_notice()

    selected_id = (
        str(st.session_state.get("selected_workflow_id", ""))
        if st.session_state.get("selected_workflow_type") == "contract_review"
        else ""
    )
    with st.form("open_review_form"):
        workflow_id = st.text_input("Contract review workflow ID", value=selected_id)
        open_review = st.form_submit_button(
            "Open review",
            type="primary",
            icon=":material/rate_review:",
        )
    if open_review:
        normalized_id = workflow_id.strip()
        if not normalized_id:
            st.error("Enter a contract review workflow ID.")
            return
        select_workflow(
            st.session_state,
            workflow_id=normalized_id,
            workflow_type="contract_review",
        )
        st.rerun()

    if not selected_id:
        st.info(
            "Select a contract review workflow to load its review state.",
            icon=":material/info:",
        )
        return

    try:
        status = get_api_client().get_contract_status(selected_id)
    except APIClientError as exc:
        render_api_error(exc)
        return

    st.session_state["latest_known_revision"] = status.current_revision
    render_contract_status(status)
    if status.result_available:
        st.warning(
            "This workflow is terminal. Open Results / Previous Runs for its outcome.",
            icon=":material/flag:",
        )
        if st.button("Open result", icon=":material/description:"):
            st.session_state["active_page"] = "Results"
            st.rerun()
        return
    if status.phase != "awaiting_review":
        st.info(
            "No decision is available until the workflow reaches awaiting review.",
            icon=":material/hourglass_top:",
        )
        if st.button("Refresh review state", icon=":material/refresh:"):
            st.rerun()
        return

    try:
        report_state = get_api_client().get_contract_report(selected_id)
    except APIConflictError:
        _handle_stale_review(selected_id)
    except APIClientError as exc:
        render_api_error(exc)
        return

    if report_state.current_revision != status.current_revision:
        _handle_stale_review(selected_id)

    if report_state.completeness == "partial":
        st.warning(
            "Partial report: at least one contract could not be processed.",
            icon=":material/warning:",
        )
    render_contract_report(
        report_state.report,
        title=f"Current report / revision {report_state.current_revision}",
    )
    render_document_outcomes(report_state.documents)
    _render_assignment(selected_id, status.reviewer)
    _render_decisions(selected_id, status.current_revision, status.reviewer)
