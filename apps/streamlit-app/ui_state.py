from collections.abc import MutableMapping
from typing import Literal

WorkflowTypeValue = Literal["pdf", "contract_review"]

SESSION_DEFAULTS: dict[str, object] = {
    "active_page": "Dashboard",
    "selected_workflow_id": "",
    "selected_workflow_type": None,
    "last_started_workflow_id": "",
    "last_submission_fingerprint": "",
    "latest_known_revision": None,
    "last_review_submission": "",
    "polling_stopped_for": "",
    "flash_message": "",
}


def initialize_session_state(state: MutableMapping[str, object]) -> None:
    for key, value in SESSION_DEFAULTS.items():
        if key not in state:
            state[key] = value


def select_workflow(
    state: MutableMapping[str, object],
    *,
    workflow_id: str,
    workflow_type: WorkflowTypeValue,
) -> None:
    state["selected_workflow_id"] = workflow_id
    state["selected_workflow_type"] = workflow_type
    state["latest_known_revision"] = None
    state["last_review_submission"] = ""
    state["polling_stopped_for"] = ""


def remember_started_workflow(
    state: MutableMapping[str, object],
    *,
    workflow_id: str,
    workflow_type: WorkflowTypeValue,
    submission_fingerprint: str,
) -> None:
    select_workflow(
        state,
        workflow_id=workflow_id,
        workflow_type=workflow_type,
    )
    state["last_started_workflow_id"] = workflow_id
    state["last_submission_fingerprint"] = submission_fingerprint


def is_duplicate_submission(
    state: MutableMapping[str, object],
    submission_fingerprint: str,
) -> bool:
    return bool(state.get("last_started_workflow_id")) and (
        state.get("last_submission_fingerprint") == submission_fingerprint
    )


def clear_submission_guard(state: MutableMapping[str, object]) -> None:
    state["last_started_workflow_id"] = ""
    state["last_submission_fingerprint"] = ""
