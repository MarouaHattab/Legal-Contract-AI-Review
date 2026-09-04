from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities import analyze_contract_artifact, extract_contract_artifact
    from helpers import (
        AnalyzeContractInput,
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
    async def run(self,params:PDFSummaryInput) -> PDFSummaryOutput:
        extracted = await workflow.execute_activity(
            extract_contract_artifact,
            ExtractPDFInput(s3_path=params.s3_path),
            retry_policy=DEFAULT_RETRY_POLICY,
            start_to_close_timeout=timedelta(minutes=20),
            heartbeat_timeout=timedelta(seconds=30),
        )

        analysis = await workflow.execute_activity(
            analyze_contract_artifact,
            AnalyzeContractInput(
                source_s3_path=params.s3_path,
                artifact=extracted.artifact,
            ),
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
