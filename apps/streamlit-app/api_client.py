from collections.abc import Mapping, Sequence
from typing import Any, Literal, TypeVar
from urllib.parse import quote

import httpx
from config import StreamlitSettings
from models import (
    ContractReportQuery,
    ContractReviewResult,
    ContractWorkflowStatus,
    HealthResponse,
    PDFUploadResponse,
    PDFWorkflowResult,
    PDFWorkflowStatus,
    ReviewActionResponse,
    WorkflowListResponse,
    WorkflowStartResponse,
)
from pydantic import BaseModel, ValidationError

ResponseModel = TypeVar("ResponseModel", bound=BaseModel)
UploadPayload = Sequence[tuple[str, bytes]]
MultipartFiles = list[tuple[str, tuple[str, bytes, str]]]


class APIClientError(Exception):
    def __init__(self, user_message: str, *, status_code: int | None = None):
        super().__init__(user_message)
        self.user_message = user_message
        self.status_code = status_code


class APIConnectionError(APIClientError):
    pass


class APIRequestTimeout(APIClientError):
    pass


class InputValidationError(APIClientError):
    pass


class WorkflowNotFoundError(APIClientError):
    pass


class APIConflictError(APIClientError):
    pass


class BackendUnavailableError(APIClientError):
    pass


class UnexpectedAPIError(APIClientError):
    pass


def _validation_message(detail: list[Any]) -> str:
    messages: list[str] = []
    for issue in detail:
        if not isinstance(issue, Mapping):
            continue
        location = issue.get("loc", [])
        field = ".".join(str(item) for item in location if item != "body")
        message = str(issue.get("msg", "Invalid value."))
        messages.append(f"{field}: {message}" if field else message)
    return " ".join(messages) or "Please check the submitted values."


def _response_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return ""
    if not isinstance(payload, Mapping):
        return ""
    detail = payload.get("detail")
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        return _validation_message(detail)
    return ""


class DocumentAPIClient:
    """Small typed client for the application-level FastAPI contract."""

    def __init__(
        self,
        settings: StreamlitSettings,
        *,
        transport: httpx.BaseTransport | None = None,
    ):
        self._settings = settings
        self._client = httpx.Client(
            base_url=str(settings.api_base_url),
            timeout=settings.request_timeout_seconds,
            transport=transport,
            headers={"Accept": "application/json"},
        )

    def close(self) -> None:
        self._client.close()

    def _raise_for_error(self, response: httpx.Response) -> None:
        if response.is_success:
            return

        detail = _response_detail(response)
        status_code = response.status_code
        if status_code == 404:
            raise WorkflowNotFoundError(
                detail or "The requested workflow was not found.",
                status_code=status_code,
            )
        if status_code == 409:
            raise APIConflictError(
                detail or "The workflow state changed. Refresh and try again.",
                status_code=status_code,
            )
        if status_code == 422:
            raise InputValidationError(
                detail or "Please check the submitted values.",
                status_code=status_code,
            )
        if status_code == 503:
            raise BackendUnavailableError(
                detail or "The workflow service is currently unavailable.",
                status_code=status_code,
            )
        raise UnexpectedAPIError(
            "The API returned an unexpected error. Please try again.",
            status_code=status_code,
        )

    def _request(
        self,
        method: str,
        path: str,
        response_model: type[ResponseModel],
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        files: MultipartFiles | None = None,
        retry_safe: bool = False,
    ) -> ResponseModel:
        attempts = self._settings.read_attempts if retry_safe else 1
        for attempt in range(attempts):
            try:
                response = self._client.request(
                    method,
                    path,
                    json=json,
                    params=params,
                    files=files,
                )
            except httpx.TimeoutException as exc:
                if attempt + 1 < attempts:
                    continue
                raise APIRequestTimeout(
                    "The API request timed out. The workflow may still be running."
                ) from exc
            except httpx.RequestError as exc:
                if attempt + 1 < attempts:
                    continue
                raise APIConnectionError(
                    "The interface could not connect to the document API."
                ) from exc

            self._raise_for_error(response)
            try:
                return response_model.model_validate(response.json())
            except (ValueError, ValidationError) as exc:
                raise UnexpectedAPIError(
                    "The API returned a response the interface could not understand."
                ) from exc

        raise AssertionError("Request attempt loop completed unexpectedly.")

    @staticmethod
    def _workflow_path(workflow_id: str) -> str:
        return quote(workflow_id, safe="")

    def readiness(self) -> HealthResponse:
        return self._request(
            "GET",
            "/health/ready",
            HealthResponse,
            retry_safe=True,
        )

    def list_workflows(self, *, limit: int) -> WorkflowListResponse:
        return self._request(
            "GET",
            "/workflows",
            WorkflowListResponse,
            params={"limit": limit},
            retry_safe=True,
        )

    def upload_pdfs(self, uploads: UploadPayload) -> PDFUploadResponse:
        files: MultipartFiles = [
            ("files", (filename, content, "application/pdf"))
            for filename, content in uploads
        ]
        return self._request(
            "POST",
            "/uploads/pdfs",
            PDFUploadResponse,
            files=files,
        )

    def start_pdf(self, s3_path: str) -> WorkflowStartResponse:
        return self._request(
            "POST",
            "/process_pdf/start",
            WorkflowStartResponse,
            json={"s3_path": s3_path},
        )

    def get_pdf_status(self, workflow_id: str) -> PDFWorkflowStatus:
        return self._request(
            "GET",
            f"/process_pdf/{self._workflow_path(workflow_id)}/status",
            PDFWorkflowStatus,
            retry_safe=True,
        )

    def get_pdf_result(self, workflow_id: str) -> PDFWorkflowResult:
        return self._request(
            "GET",
            f"/process_pdf/{self._workflow_path(workflow_id)}/result",
            PDFWorkflowResult,
            retry_safe=True,
        )

    def start_contract_review(
        self,
        s3_paths: list[str],
        *,
        max_revisions: int,
    ) -> WorkflowStartResponse:
        return self._request(
            "POST",
            "/contract-review/start",
            WorkflowStartResponse,
            json={"s3_paths": s3_paths, "max_revisions": max_revisions},
        )

    def get_contract_status(self, workflow_id: str) -> ContractWorkflowStatus:
        return self._request(
            "GET",
            f"/contract-review/{self._workflow_path(workflow_id)}/status",
            ContractWorkflowStatus,
            retry_safe=True,
        )

    def get_contract_report(self, workflow_id: str) -> ContractReportQuery:
        return self._request(
            "GET",
            f"/contract-review/{self._workflow_path(workflow_id)}/report",
            ContractReportQuery,
            retry_safe=True,
        )

    def get_contract_result(self, workflow_id: str) -> ContractReviewResult:
        return self._request(
            "GET",
            f"/contract-review/{self._workflow_path(workflow_id)}/result",
            ContractReviewResult,
            retry_safe=True,
        )

    def assign_reviewer(
        self,
        workflow_id: str,
        name: str,
    ) -> ReviewActionResponse:
        return self._request(
            "POST",
            f"/contract-review/{self._workflow_path(workflow_id)}/assign",
            ReviewActionResponse,
            json={"name": name},
        )

    def submit_review(
        self,
        workflow_id: str,
        *,
        decision: Literal["approve", "revise"],
        expected_revision: int,
        feedback: str = "",
    ) -> ReviewActionResponse:
        return self._request(
            "POST",
            f"/contract-review/{self._workflow_path(workflow_id)}/decision",
            ReviewActionResponse,
            json={
                "decision": decision,
                "feedback": feedback,
                "expected_revision": expected_revision,
            },
        )
