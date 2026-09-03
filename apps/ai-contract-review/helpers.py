import os
import boto3
from dataclasses import dataclass
from dotenv import load_dotenv
from typing import Optional


load_dotenv()


API_KEY=os.environ["OPENROUTER_API_KEY"]
BASE_URL=os.environ["BASE_URL"]
MODEL=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")


TEMPORAL_HOST       = os.environ["TEMPORAL_HOST"]
TEMPORAL_NAMESPACE  = os.environ["TEMPORAL_NAMESPACE"]
TEMPORAL_TASK_QUEUE = os.environ["TEMPORAL_TASK_QUEUE"]

# Dataclasses 
@dataclass
class ExtractPDFInput:
    s3_path: str
    batch_size: int = 2

@dataclass
class ExtractPDFOutput:
    s3_path: str
    markdown_text: str
    page_count: int

@dataclass
class CallLLMInput:
    prompt: str

@dataclass
class CallLLMOutput:
    content: str

@dataclass
class PDFSummaryInput:
    s3_path:str

@dataclass(frozen=True)
class PDFSummaryOutput:
    s3_path:str
    summary:str
    key_risks:str    

@dataclass
class ContractReviewInput:
    s3_paths: list
    max_revisions: int = 2

@dataclass
class ContractReviewOutput:
    report: str
    sources: list
    approved_by: str


@dataclass(frozen=True)
class ArtifactReference:
    s3_path: str
    sha256: str
    size_bytes: int
    content_type: str


@dataclass(frozen=True)
class DocumentAnalysis:
    summary: str
    key_risks: str
    chunks_processed: int
    characters_processed: int
    artifact: ArtifactReference


@dataclass(frozen=True)
class AnalyzeContractInput:
    source_s3_path: str
    artifact: ArtifactReference


@dataclass(frozen=True)
class DocumentOutcome:
    s3_path: str
    status: str
    analysis: Optional[DocumentAnalysis] = None
    error: str = ""


@dataclass(frozen=True)
class ContractReport:
    overall_risk_level: str
    top_cross_contract_risks: str
    recommended_actions: str


@dataclass(frozen=True)
class ReviewCommand:
    decision: str
    feedback: str = ""
    expected_revision: int = 0


@dataclass(frozen=True)
class ContractReviewResult:
    final_status: str
    completeness: str
    report: Optional[ContractReport]
    documents: list[DocumentOutcome]
    reviewer: str
    revision_count: int
#  S3 helper 

def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ["AWS_REGION"],
        endpoint_url=os.environ["AWS_S3_ENDPOINT_URL"],
    )

def parse_s3_path(s3_path: str):
    s3_path_no_scheme = s3_path.replace("s3://", "")
    bucket, _, key =  s3_path_no_scheme.partition("/")
    return bucket, key
