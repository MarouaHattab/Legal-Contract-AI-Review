from typing import Literal, Protocol

from models import ContractWorkflowStatus, ReviewActionResponse


class ReviewAPI(Protocol):
    def get_contract_status(self, workflow_id: str) -> ContractWorkflowStatus: ...

    def submit_review(
        self,
        workflow_id: str,
        *,
        decision: Literal["approve", "revise"],
        expected_revision: int,
        feedback: str = "",
    ) -> ReviewActionResponse: ...


class ReviewStateChanged(Exception):
    def __init__(self, latest_status: ContractWorkflowStatus):
        super().__init__("The review state changed.")
        self.latest_status = latest_status


def guarded_submit_review(
    client: ReviewAPI,
    *,
    workflow_id: str,
    decision: Literal["approve", "revise"],
    expected_revision: int,
    feedback: str = "",
) -> ReviewActionResponse:
    latest_status = client.get_contract_status(workflow_id)
    if (
        latest_status.phase != "awaiting_review"
        or latest_status.current_revision != expected_revision
    ):
        raise ReviewStateChanged(latest_status)

    return client.submit_review(
        workflow_id,
        decision=decision,
        expected_revision=expected_revision,
        feedback=feedback,
    )
