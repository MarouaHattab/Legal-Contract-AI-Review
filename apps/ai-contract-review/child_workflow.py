from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from helpers import (
        AnalyzeContractInput,
        DocumentAnalysis,
        ExtractContractArtifactOutput,
        ExtractPDFInput,
        PDFSummaryInput,
        PDFSummaryOutput,
    )

DEFAULT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=3),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
) 
@workflow.defn
class PDFSummaryWorkflow:
    @workflow.run
    async def run(self, params: PDFSummaryInput) -> PDFSummaryOutput:
        workflow_task_queue = workflow.info().task_queue
        document_task_queue = params.document_task_queue or workflow_task_queue
        llm_task_queue = params.llm_task_queue or workflow_task_queue
        extracted = await workflow.execute_activity(
            "extract_contract_artifact",
            ExtractPDFInput(s3_path=params.s3_path),
            result_type=ExtractContractArtifactOutput,
            task_queue=document_task_queue,
            retry_policy=DEFAULT_RETRY_POLICY,
            start_to_close_timeout=timedelta(minutes=20),
            heartbeat_timeout=timedelta(seconds=30),
        )

        analysis = await workflow.execute_activity(
            "analyze_contract_artifact",
            AnalyzeContractInput(
                source_s3_path=params.s3_path,
                artifact=extracted.artifact,
            ),
            result_type=DocumentAnalysis,
            task_queue=llm_task_queue,
            retry_policy=DEFAULT_RETRY_POLICY,
            start_to_close_timeout=timedelta(minutes=30),
            heartbeat_timeout=timedelta(seconds=180),
        )

        return PDFSummaryOutput(
            s3_path=params.s3_path,
            summary=analysis.summary,
            key_risks=analysis.key_risks,
            chunks_processed=analysis.chunks_processed,
            characters_processed=analysis.characters_processed,
            artifact=analysis.artifact,
        )
