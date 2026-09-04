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
DOCUMENT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
    non_retryable_error_types=[
        "InvalidPDFInput",
        "EmptyContract",
        "UnsafeOutputKey",
    ],
)
LLM_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=4,
    non_retryable_error_types=[
        "EmptyContract",
        "MalformedLLMResponse",
    ],
)


@workflow.defn
class PDFSummaryWorkflow:
    @workflow.run
    async def run(self, params: PDFSummaryInput) -> PDFSummaryOutput:
        workflow_task_queue = workflow.info().task_queue
        document_task_queue = params.document_task_queue or workflow_task_queue
        llm_task_queue = params.llm_task_queue or workflow_task_queue
        use_phase_2_options = workflow.patched(
            "contract-phase-2-activity-options"
        )
        document_options = (
            {
                "retry_policy": DOCUMENT_RETRY_POLICY,
                "schedule_to_close_timeout": timedelta(minutes=65),
                "activity_id": "extract-contract",
            }
            if use_phase_2_options
            else {"retry_policy": DEFAULT_RETRY_POLICY}
        )
        extracted = await workflow.execute_activity(
            "extract_contract_artifact",
            ExtractPDFInput(s3_path=params.s3_path),
            result_type=ExtractContractArtifactOutput,
            task_queue=document_task_queue,
            start_to_close_timeout=timedelta(minutes=20),
            heartbeat_timeout=timedelta(seconds=30),
            **document_options,
        )

        llm_options = (
            {
                "retry_policy": LLM_RETRY_POLICY,
                "schedule_to_close_timeout": timedelta(minutes=125),
                "activity_id": "analyze-contract",
            }
            if use_phase_2_options
            else {"retry_policy": DEFAULT_RETRY_POLICY}
        )
        analysis = await workflow.execute_activity(
            "analyze_contract_artifact",
            AnalyzeContractInput(
                source_s3_path=params.s3_path,
                artifact=extracted.artifact,
            ),
            result_type=DocumentAnalysis,
            task_queue=llm_task_queue,
            start_to_close_timeout=timedelta(minutes=30),
            heartbeat_timeout=timedelta(seconds=180),
            **llm_options,
        )

        return PDFSummaryOutput(
            s3_path=params.s3_path,
            summary=analysis.summary,
            key_risks=analysis.key_risks,
            chunks_processed=analysis.chunks_processed,
            characters_processed=analysis.characters_processed,
            artifact=analysis.artifact,
        )
