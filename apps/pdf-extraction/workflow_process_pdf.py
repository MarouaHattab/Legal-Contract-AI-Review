from datetime import timedelta
from dataclasses import dataclass

from temporalio import workflow
from temporalio.common import RetryPolicy


with workflow.unsafe.imports_passed_through():
    from activities import convert_pdf_to_markdown
    from helpers import ConvertPDFInput

@dataclass
class PDFPipelineInput:
    s3_path: str # exmple : "s3://bucket/reports/annual-report.pdf"
@dataclass
class PDFPipelineOutput:
    output_s3_path: str
    sha256: str
    size_bytes: int
    content_type: str

DEFAULT_RETRY = RetryPolicy(
    # Wait 2 seconds before the first retry.
    initial_interval=timedelta(seconds=2),

    # Exponential backoff: double the wait after each failed attempt.
    # Example: 2s → 4s → 8s → 16s
    backoff_coefficient=2.0,

    # Cap the retry delay at 60 seconds.
    # Even if exponential backoff calculates > 60s, Temporal waits at most 60s.
    maximum_interval=timedelta(seconds=60),

    # Maximum total attempts, INCLUDING the first attempt.
    # So: 1 initial attempt + up to 4 retries.
    maximum_attempts=5,
)
@workflow.defn
class PDFPipelineWorkflow:
    def __init__(self) -> None:
        self._phase = "queued"

    @workflow.query
    def get_status(self) -> dict:
        return {"phase": self._phase}

    @workflow.run
    async def run(self,params: PDFPipelineInput) -> PDFPipelineOutput:
        workflow.logger.info(f"Starting PDF Pipeline for {params.s3_path}")
        self._phase = "processing"
        converted = await workflow.execute_activity(
            convert_pdf_to_markdown,
            ConvertPDFInput(s3_path=params.s3_path),
            retry_policy=DEFAULT_RETRY,
            start_to_close_timeout=timedelta(minutes=15),
        )

        self._phase = "completed"
        artifact = converted.artifact
        workflow.logger.info(
            f"PDF Pipeline completed for {params.s3_path}. Output: {artifact.s3_path}"
        )
        return PDFPipelineOutput(
            output_s3_path=artifact.s3_path,
            sha256=artifact.sha256,
            size_bytes=artifact.size_bytes,
            content_type=artifact.content_type,
        )
