from dataclasses import dataclass
from datetime import timedelta
import textwrap
import json_repair
from temporalio import workflow
from temporalio.common import RetryPolicy
with workflow.unsafe.imports_passed_through():
    from helpers import PDFSummaryInput, PDFSummaryOutput
    from activities import extract_pdf, call_llm
    from helpers import (
        ExtractPDFInput,
        ExtractPDFOutput,
        CallLLMInput,
        CallLLMOutput,
    )

from prompts import _SUMMARY_PROMPT

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
        #execute extract_pdf 
        extracted_md=await workflow.execute_activity(
            extract_pdf,
            ExtractPDFInput(s3_path=params.s3_path),
            retry_policy=DEFAULT_RETRY_POLICY,
            start_to_close_timeout=timedelta(minutes=20),
            heartbeat_timeout=timedelta(seconds=30),
        )

        # execute call_llm
        prompt = _SUMMARY_PROMPT.format(text=extracted_md.markdown_text[:5_000])
        llm_result=await workflow.execute_activity(
            call_llm, 
            CallLLMInput(
                prompt=prompt
            ),
            retry_policy=DEFAULT_RETRY_POLICY,
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=180),
        )

        parsed_output=json_repair.loads(llm_result.content)
        return PDFSummaryOutput(
            s3_path=params.s3_path,
            summary=parsed_output.get("summary",""),
            key_risks=parsed_output.get("key_risks",""),
        )