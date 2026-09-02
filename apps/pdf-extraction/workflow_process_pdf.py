from datetime import timedelta
from dataclasses import dataclass

from temporalio import workflow
from temporalio.common import RetryPolicy


with workflow.unsafe.imports_passed_through():
    from activities import (
        download_pdf, extract_to_markdown, upload_markdown,
    )

    from helpers import (
        DownloadInput, DownloadOutput,
        ExtractInput, ExtractOutput,
        UploadInput, UploadOutput
    )

@dataclass
class PDFPipelineInput:
    s3_path: str # exmple : "s3://bucket/reports/annual-report.pdf"
@dataclass
class PDFPipelineOutput:
    output_s3_path: str # example : "s3://bucket/reports/annual-report.md"

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
    @workflow.run
    async def run(self,params: PDFPipelineInput) -> PDFPipelineOutput:
        workflow.logger.info(f"Starting PDF Pipeline for {params.s3_path}")
        #step 1: Download PDF from S3
        download_result = await workflow.execute_activity(
            download_pdf,
            DownloadInput(s3_path=params.s3_path),
            retry_policy=DEFAULT_RETRY,
            start_to_close_timeout=timedelta(minutes=3) # Set a timeout for the download activity
        )

        # step 2: Extract text from PDF and convert to Markdown

        extract_result = await workflow.execute_activity(
            extract_to_markdown,
            ExtractInput(local_path=download_result.local_path),
            retry_policy=DEFAULT_RETRY,
            start_to_close_timeout=timedelta(minutes=10) # Set a timeout for the extraction activity
        )

        # step 3: Upload Markdown to S3
        upload_result = await workflow.execute_activity(
            upload_markdown,
            UploadInput(
                markdown_text=extract_result.markdown_text,
                original_s3_path=params.s3_path,
            ),
            retry_policy=DEFAULT_RETRY,
            start_to_close_timeout=timedelta(minutes=3) # Set a timeout for the upload activity
        )
        workflow.logger.info(f"PDF Pipeline completed for {params.s3_path}. Output: {upload_result.output_s3_path}")
        return PDFPipelineOutput(
            output_s3_path=upload_result.output_s3_path
        )