from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class UIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WorkflowType(StrEnum):
    PDF = "pdf"
    CONTRACT_REVIEW = "contract_review"


class WorkflowStartResponse(UIModel):
    workflow_id: str


class WorkflowSummary(UIModel):
    workflow_id: str
    run_id: str
    workflow_type: WorkflowType
    execution_status: str
    start_time: datetime
    close_time: datetime | None = None


class WorkflowListResponse(UIModel):
    workflows: list[WorkflowSummary]


class HealthResponse(UIModel):
    status: Literal["ready"]


class PDFWorkflowStatus(UIModel):
    workflow_id: str
    execution_status: str
    phase: str
    result_available: bool


class PDFArtifact(UIModel):
    output_s3_path: str
    sha256: str = Field(min_length=64, max_length=64)
    size_bytes: int = Field(ge=0)
    content_type: str


class PDFWorkflowResult(UIModel):
    workflow_id: str
    execution_status: str
    final_status: Literal["completed", "failed", "cancelled", "timed_out"]
    result: PDFArtifact | None = None
    error: str = ""


class Artifact(UIModel):
    s3_path: str
    sha256: str
    size_bytes: int
    content_type: str


class DocumentAnalysis(UIModel):
    summary: str
    key_risks: str
    chunks_processed: int
    characters_processed: int
    artifact: Artifact


class DocumentOutcome(UIModel):
    s3_path: str
    status: Literal["succeeded", "failed"]
    analysis: DocumentAnalysis | None = None
    error: str = ""


class ContractReport(UIModel):
    overall_risk_level: str
    top_cross_contract_risks: str
    recommended_actions: str


class ContractDocumentProgress(UIModel):
    s3_path: str
    status: Literal["succeeded", "failed"]
    error: str = ""
    chunks_processed: int | None = None
    characters_processed: int | None = None
    artifact_s3_path: str | None = None


class ContractWorkflowStatus(UIModel):
    workflow_id: str
    execution_status: str
    phase: str
    current_revision: int
    reviewer: str
    completeness: str
    documents: list[ContractDocumentProgress]
    report_available: bool
    result_available: bool


class ContractReportQuery(UIModel):
    workflow_id: str
    phase: str
    current_revision: int
    reviewer: str
    completeness: str
    report: ContractReport | None
    documents: list[DocumentOutcome]


class ContractReviewResult(UIModel):
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
    report: ContractReport | None
    documents: list[DocumentOutcome]
    reviewer: str
    revision_count: int
    error: str = ""


class ReviewActionResponse(UIModel):
    status: Literal["accepted"]
    message: str


PDF_TERMINAL_PHASES = frozenset({"completed", "failed", "cancelled", "timed_out"})
CONTRACT_TERMINAL_PHASES = frozenset(
    {
        "approved",
        "timed_out",
        "revision_limit_reached",
        "cancelled",
        "failed",
    }
)
