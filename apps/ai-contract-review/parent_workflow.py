import asyncio
from dataclasses import asdict
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError
from temporalio.workflow import ParentClosePolicy

with workflow.unsafe.imports_passed_through():
    from child_workflow import LLM_RETRY_POLICY, PDFSummaryWorkflow
    from helpers import (
        ContractReport,
        ContractReviewInput,
        ContractReviewResult,
        DocumentAnalysis,
        DocumentOutcome,
        PDFSummaryInput,
        ReviewCommand,
        ReviseReportInput,
        SynthesizeReportInput,
    )


DEFAULT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=3),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)
REVIEW_TIMEOUT = timedelta(days=3)
MAX_DOCUMENTS = 20
MAX_REVISIONS = 10


@workflow.defn
class ContractReviewWorkflow:
    def __init__(self) -> None:
        self._phase = "processing"
        self._documents: list[DocumentOutcome] = []
        self._report: ContractReport | None = None
        self._reviewer = ""
        self._current_revision = 0
        self._pending_review: ReviewCommand | None = None
        self._completeness = "pending"
        self._use_phase_2_activity_options = False

    def _llm_activity_options(self, activity_id: str) -> dict:
        if not self._use_phase_2_activity_options:
            return {"retry_policy": DEFAULT_RETRY_POLICY}
        return {
            "retry_policy": LLM_RETRY_POLICY,
            "schedule_to_close_timeout": timedelta(minutes=15),
            "activity_id": activity_id,
        }

    @workflow.query
    def get_status(self) -> dict:
        documents = []
        for document in self._documents:
            item = {
                "s3_path": document.s3_path,
                "status": document.status,
                "error": document.error,
            }
            if document.analysis is not None:
                item.update(
                    {
                        "chunks_processed": document.analysis.chunks_processed,
                        "characters_processed": document.analysis.characters_processed,
                        "artifact_s3_path": document.analysis.artifact.s3_path,
                    }
                )
            documents.append(item)

        return {
            "phase": self._phase,
            "current_revision": self._current_revision,
            "reviewer": self._reviewer,
            "completeness": self._completeness,
            "documents": documents,
            "report_available": self._report is not None,
        }

    @workflow.query
    def get_report(self) -> dict:
        return {
            "phase": self._phase,
            "current_revision": self._current_revision,
            "reviewer": self._reviewer,
            "completeness": self._completeness,
            "report": asdict(self._report) if self._report is not None else None,
            "documents": [asdict(document) for document in self._documents],
        }

    @workflow.signal
    async def assign_reviewer(self, name: str) -> None:
        normalized = name.strip()
        if normalized:
            self._reviewer = normalized

    @workflow.update
    async def submit_review(self, command: ReviewCommand) -> str:
        self._pending_review = command
        return (
            f"Decision '{command.decision}' accepted for revision "
            f"{command.expected_revision}."
        )

    @submit_review.validator
    def validate_review(self, command: ReviewCommand) -> None:
        if self._phase != "awaiting_review":
            raise ValueError("The workflow is not awaiting human review.")
        if not self._reviewer:
            raise ValueError("A reviewer must be assigned before submitting a decision.")
        if self._pending_review is not None:
            raise ValueError("A review decision is already pending.")
        if command.expected_revision != self._current_revision:
            raise ValueError(
                "Stale review decision: expected revision "
                f"{self._current_revision}, got {command.expected_revision}."
            )
        if command.decision not in ("approve", "revise"):
            raise ValueError("Decision must be 'approve' or 'revise'.")
        if command.decision == "revise" and not command.feedback.strip():
            raise ValueError("Feedback is required when requesting a revision.")

    def _validate_input(self, params: ContractReviewInput) -> None:
        if not params.s3_paths:
            raise ApplicationError(
                "At least one contract document is required.",
                type="InvalidWorkflowInput",
                non_retryable=True,
            )
        if len(params.s3_paths) > MAX_DOCUMENTS:
            raise ApplicationError(
                f"At most {MAX_DOCUMENTS} contract documents are allowed.",
                type="InvalidWorkflowInput",
                non_retryable=True,
            )
        if len(set(params.s3_paths)) != len(params.s3_paths):
            raise ApplicationError(
                "Duplicate contract documents are not allowed.",
                type="InvalidWorkflowInput",
                non_retryable=True,
            )
        if not 0 <= params.max_revisions <= MAX_REVISIONS:
            raise ApplicationError(
                f"max_revisions must be between 0 and {MAX_REVISIONS}.",
                type="InvalidWorkflowInput",
                non_retryable=True,
            )

    def _result(self, final_status: str) -> ContractReviewResult:
        return ContractReviewResult(
            final_status=final_status,
            completeness=self._completeness,
            report=self._report,
            documents=self._documents,
            reviewer=self._reviewer,
            revision_count=self._current_revision,
        )

    async def _process_documents(self, params: ContractReviewInput) -> None:
        self._phase = "extracting"
        workflow_id = workflow.info().workflow_id
        task_queue = workflow.info().task_queue
        handles = await asyncio.gather(
            *[
                workflow.start_child_workflow(
                    PDFSummaryWorkflow.run,
                    PDFSummaryInput(
                        s3_path=s3_path,
                        document_task_queue=params.document_task_queue,
                        llm_task_queue=params.llm_task_queue,
                    ),
                    id=f"{workflow_id}-pdf-{index + 1}",
                    task_queue=task_queue,
                    parent_close_policy=ParentClosePolicy.REQUEST_CANCEL,
                )
                for index, s3_path in enumerate(params.s3_paths)
            ]
        )
        raw_results = await asyncio.gather(*handles, return_exceptions=True)

        for s3_path, result in zip(params.s3_paths, raw_results):
            if isinstance(result, Exception):
                workflow.logger.warning("Contract document failed: %s", s3_path)
                self._documents.append(
                    DocumentOutcome(
                        s3_path=s3_path,
                        status="failed",
                        error="Document processing failed after retries.",
                    )
                )
                continue

            self._documents.append(
                DocumentOutcome(
                    s3_path=s3_path,
                    status="succeeded",
                    analysis=DocumentAnalysis(
                        summary=result.summary,
                        key_risks=result.key_risks,
                        chunks_processed=result.chunks_processed,
                        characters_processed=result.characters_processed,
                        artifact=result.artifact,
                    ),
                )
            )

        succeeded = sum(
            document.status == "succeeded" for document in self._documents
        )
        if succeeded == 0:
            self._completeness = "failed"
        elif succeeded == len(self._documents):
            self._completeness = "complete"
        else:
            self._completeness = "partial"

    async def _await_human_review(
        self,
        params: ContractReviewInput,
    ) -> ContractReviewResult:
        while True:
            # Clear the prior command before advertising that this cycle is ready.
            self._pending_review = None
            self._phase = "awaiting_review"
            try:
                await workflow.wait_condition(
                    lambda: self._pending_review is not None,
                    timeout=REVIEW_TIMEOUT,
                )
            except asyncio.TimeoutError:
                self._phase = "timed_out"
                return self._result("timed_out")

            command = self._pending_review
            if command is None:
                raise ApplicationError(
                    "Review state was unexpectedly empty.",
                    type="InvalidReviewState",
                    non_retryable=True,
                )
            self._pending_review = None

            if command.decision == "approve":
                self._phase = "approved"
                return self._result("approved")

            if self._current_revision >= params.max_revisions:
                self._phase = "revision_limit_reached"
                return self._result("revision_limit_reached")

            self._phase = "revising"
            if self._report is None:
                raise ApplicationError(
                    "A report is required before revision.",
                    type="InvalidReviewState",
                    non_retryable=True,
                )
            self._report = await workflow.execute_activity(
                "revise_contract_report",
                ReviseReportInput(
                    report=self._report,
                    feedback=command.feedback,
                ),
                result_type=ContractReport,
                task_queue=params.llm_task_queue or workflow.info().task_queue,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=180),
                **self._llm_activity_options(
                    f"revise-report-{self._current_revision + 1}"
                ),
            )
            self._current_revision += 1

    @workflow.run
    async def run(self, params: ContractReviewInput) -> ContractReviewResult:
        try:
            self._use_phase_2_activity_options = workflow.patched(
                "contract-phase-2-activity-options"
            )
            self._validate_input(params)
            await self._process_documents(params)
            if self._completeness == "failed":
                self._phase = "failed"
                return self._result("failed")

            self._phase = "analyzing"
            self._report = await workflow.execute_activity(
                "synthesize_contract_report",
                SynthesizeReportInput(
                    documents=self._documents,
                    completeness=self._completeness,
                ),
                result_type=ContractReport,
                task_queue=params.llm_task_queue or workflow.info().task_queue,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=180),
                **self._llm_activity_options("synthesize-report"),
            )
            return await self._await_human_review(params)
        except asyncio.CancelledError:
            self._phase = "cancelled"
            raise
        except Exception:
            self._phase = "failed"
            raise
