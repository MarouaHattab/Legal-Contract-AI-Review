from pathlib import PurePosixPath
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Phase 1 guardrails: keep one API request well below Temporal's pending-child
# limits and bound accidental LLM fan-out/cost for this educational deployment.
MAX_CONTRACT_DOCUMENTS = 20
MAX_REVISIONS = 10
MAX_S3_URI_LENGTH = 2_048
MAX_REVIEWER_NAME_LENGTH = 200
MAX_REVIEW_FEEDBACK_LENGTH = 10_000


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def validate_s3_pdf_uri(value: str) -> str:
    parsed = urlsplit(value)
    key = parsed.path.removeprefix("/")
    if (
        parsed.scheme != "s3"
        or not parsed.netloc
        or not key
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
        or parsed.port
        or PurePosixPath(key).suffix.lower() != ".pdf"
    ):
        raise ValueError("Must be a valid s3://bucket/key.pdf URI.")
    return value


class PDFProcessRequest(APIModel):
    s3_path: str = Field(min_length=1, max_length=MAX_S3_URI_LENGTH)

    @field_validator("s3_path")
    @classmethod
    def validate_pdf_path(cls, value: str) -> str:
        return validate_s3_pdf_uri(value)


class StartReviewRequest(APIModel):
    s3_paths: list[str] = Field(
        min_length=1,
        max_length=MAX_CONTRACT_DOCUMENTS,
        description="One to 20 unique S3 PDF URIs.",
    )
    max_revisions: int = Field(default=2, ge=0, le=MAX_REVISIONS)

    @field_validator("s3_paths")
    @classmethod
    def validate_pdf_paths(cls, values: list[str]) -> list[str]:
        normalized = [validate_s3_pdf_uri(value.strip()) for value in values]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Duplicate contract documents are not allowed.")
        return normalized


class AssignRequest(APIModel):
    name: str = Field(min_length=1, max_length=MAX_REVIEWER_NAME_LENGTH)


class ReviewDecisionRequest(APIModel):
    decision: Literal["approve", "revise"]
    feedback: str = Field(default="", max_length=MAX_REVIEW_FEEDBACK_LENGTH)
    expected_revision: int = Field(ge=0, le=MAX_REVISIONS)

    @model_validator(mode="after")
    def validate_feedback(self):
        if self.decision == "revise" and not self.feedback:
            raise ValueError("Feedback is required when requesting a revision.")
        return self


class WorkflowStartResponse(APIModel):
    workflow_id: str


class PDFArtifactResult(APIModel):
    output_s3_path: str
    sha256: str = Field(min_length=64, max_length=64)
    size_bytes: int = Field(ge=0)
    content_type: str


class PDFProcessExecuteResponse(APIModel):
    workflow_id: str
    results: PDFArtifactResult


class PDFWorkflowStatusResponse(APIModel):
    workflow_id: str
    execution_status: str
    phase: str
    result_available: bool


class PDFWorkflowResultResponse(APIModel):
    workflow_id: str
    execution_status: str
    final_status: Literal["completed", "failed", "cancelled", "timed_out"]
    result: PDFArtifactResult | None = None
    error: str = ""


class ArtifactResponse(APIModel):
    s3_path: str
    sha256: str
    size_bytes: int
    content_type: str


class DocumentAnalysisResponse(APIModel):
    summary: str
    key_risks: str
    chunks_processed: int
    characters_processed: int
    artifact: ArtifactResponse


class DocumentOutcomeResponse(APIModel):
    s3_path: str
    status: Literal["succeeded", "failed"]
    analysis: DocumentAnalysisResponse | None = None
    error: str = ""


class ContractReportResponse(APIModel):
    overall_risk_level: str
    top_cross_contract_risks: str
    recommended_actions: str


class ContractDocumentProgressResponse(APIModel):
    s3_path: str
    status: Literal["succeeded", "failed"]
    error: str = ""
    chunks_processed: int | None = None
    characters_processed: int | None = None
    artifact_s3_path: str | None = None


class ContractWorkflowStatusResponse(APIModel):
    workflow_id: str
    execution_status: str
    phase: str
    current_revision: int
    reviewer: str
    completeness: str
    documents: list[ContractDocumentProgressResponse]
    report_available: bool
    result_available: bool


class ContractReportQueryResponse(APIModel):
    workflow_id: str
    phase: str
    current_revision: int
    reviewer: str
    completeness: str
    report: ContractReportResponse | None
    documents: list[DocumentOutcomeResponse]


class ContractReviewResultResponse(APIModel):
    workflow_id: str
    execution_status: str
    final_status: Literal[
        "approved",
        "timed_out",
        "revision_limit_reached",
        "cancelled",
        "failed",
    ]
    completeness: str
    report: ContractReportResponse | None
    documents: list[DocumentOutcomeResponse]
    reviewer: str
    revision_count: int
    error: str = ""


class ReviewActionResponse(APIModel):
    status: Literal["accepted"]
    message: str
