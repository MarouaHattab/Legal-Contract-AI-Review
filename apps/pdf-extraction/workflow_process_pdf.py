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

@workflow.defn
class PDFPipelineWorkflow:
    @workflow.run
    async def run(self,params: PDFPipelineInput) -> PDFPipelineOutput:
        workflow.logger.info(f"Starting PDF Pipeline for {params.s3_path}")
        #step 1: Download PDF from S3
        download_result = await workflow.execute_activity(
            download_pdf,
            DownloadInput(s3_path=params.s3_path),
        )

        # step 2: Extract text from PDF and convert to Markdown

        extract_result = await workflow.execute_activity(
            extract_to_markdown,
            ExtractInput(local_path=download_result.local_path)
        )

        # step 3: Upload Markdown to S3
        upload_result = await workflow.execute_activity(
            upload_markdown,
            UploadInput(
                markdown_text=extract_result.markdown_text,
                original_s3_path=params.s3_path
            )
        )
        workflow.logger.info(f"PDF Pipeline completed for {params.s3_path}. Output: {upload_result.output_s3_path}")
        return PDFPipelineOutput(
            output_s3_path=upload_result.output_s3_path
        )