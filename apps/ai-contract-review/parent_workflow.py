import asyncio
import textwrap
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional
import json_repair
import json

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError
from temporalio.workflow import ParentClosePolicy
with workflow.unsafe.imports_passed_through():
    from helpers import ContractReviewInput, ContractReviewOutput
    from activities import  call_llm
    from helpers import (
        CallLLMInput,
    )
    from child_workflow import PDFSummaryWorkflow, PDFSummaryInput



DEFAULT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=3),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
) 
from prompts import _SYNTHESIS_PROMPT
@workflow.defn
class ContractReviewWorkflow:

    def __init__(self):
        self._status: str = "processing"
        self._summaries: list = []
        self._report: str = ""

        self._review_decision: Optional[str] = None
        self._review_feedback: str = ""
        self._approved_by: str = ""


    @workflow.run
    async def run(self, params: ContractReviewInput) -> ContractReviewOutput:
        
        # Step 1 Fan-out — one child per PDF, all in parallel

        self._status = "extracting"

        workflow.logger.info(f"Fanning out to {len(params.s3_paths)} child workflows")

        workflow_id = workflow.info().workflow_id
        workflow_task_queue = workflow.info().task_queue
        handles = await asyncio.gather(
            *[
                workflow.start_child_workflow(
                    PDFSummaryWorkflow.run,
                    PDFSummaryInput(s3_path=current_s3_path),
                    id=f"{workflow_id}-pdf-{idx+1}",
                    task_queue=workflow_task_queue,
                    parent_close_policy=ParentClosePolicy.ABANDON,
                )
                for idx, current_s3_path in enumerate(params.s3_paths)
                
            ]
        )
        raw_results = await asyncio.gather(
            *handles,
            return_exceptions=True,
        )

        for i,res in enumerate(raw_results):
            if isinstance(res,Exception):
                workflow.logger.warning(f"PDF {i} failed {res}")
            else:
                self._summaries.append(
                    {
                        "s3_path": res.s3_path,
                        "summary": res.summary,
                        "key_risks": res.key_risks,
                    }
                    )
        if len(self._summaries) == 0:
            raise ApplicationError("All PDF failed to process .")

          # Step 2 Synthesize all summaries into a risk report
        self._status = "analyzing"
        workflow.logger.info(f"Synthesizing {len(self._summaries)} summaries into a risk report.")

        combined_summary = "\n\n".join([

            f"**Contract {i+1}** (`{summary['s3_path']}`):\n"
            f"Summary: {summary['summary']}\n"
            f"Risks: {summary['key_risks']}"

            for i, summary in enumerate(self._summaries)
        ])
        
        llm_prompt = _SYNTHESIS_PROMPT.format(
            summaries=combined_summary,
            n=len(self._summaries)
        )

        llm_result = await workflow.execute_activity(
            call_llm,
            CallLLMInput(
                prompt=llm_prompt
            ),
            start_to_close_timeout=timedelta(minutes=3),
            heartbeat_timeout=timedelta(seconds=180),
            retry_policy=DEFAULT_RETRY_POLICY,
        )

        self._report = json_repair.loads(llm_result.content)
        return ContractReviewOutput(
            status=self._status,
            report=self._report.get("report",""),
            sources=self._report.get("sources",[]),
            approved_by=self._report.get("approved_by",""),
        )