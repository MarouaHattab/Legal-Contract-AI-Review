import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

from api_models import (
    AssignRequest,
    ContractReportQueryResponse,
    ContractReviewResultResponse,
    ContractWorkflowStatusResponse,
    PDFArtifactResult,
    PDFProcessExecuteResponse,
    PDFProcessRequest,
    PDFWorkflowResultResponse,
    PDFWorkflowStatusResponse,
    ReviewActionResponse,
    ReviewDecisionRequest,
    StartReviewRequest,
    WorkflowStartResponse,
)
from fastapi import FastAPI, HTTPException
from settings import get_api_settings
from temporalio.client import Client, WorkflowUpdateFailedError
from temporalio.client import WorkflowExecutionStatus as WES
from temporalio.service import RPCError, RPCStatusCode

settings = get_api_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.temporal_client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
        lazy=True,
    )
    try:
        yield
    finally:
        application.state.temporal_client = None


app = FastAPI(
    title="Temporal Document Processing API",
    description="Starts and reviews durable PDF and contract workflows.",
    version="1.1.0",
    lifespan=lifespan,
)


async def get_temporal_client() -> Client:
    client = getattr(app.state, "temporal_client", None)
    if client is None:
        client = await Client.connect(
            settings.temporal_host,
            namespace=settings.temporal_namespace,
            lazy=True,
        )
        app.state.temporal_client = client
    return client


def _service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, RPCError) and exc.status == RPCStatusCode.NOT_FOUND:
        return HTTPException(status_code=404, detail="Workflow not found.")
    return HTTPException(
        status_code=503,
        detail="Temporal service is currently unavailable.",
    )


async def _describe_workflow(workflow_id: str):
    try:
        client = await get_temporal_client()
        handle = client.get_workflow_handle(workflow_id)
        return handle, await handle.describe()
    except Exception as exc:
        raise _service_error(exc) from exc


def _terminal_status(status: WES) -> str:
    if status == WES.COMPLETED:
        return "completed"
    if status == WES.CANCELED:
        return "cancelled"
    if status == WES.TIMED_OUT:
        return "timed_out"
    return "failed"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/live")
async def liveness():
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    try:
        client = await get_temporal_client()
        healthy = await client.service_client.check_health(
            timeout=timedelta(seconds=settings.temporal_health_timeout_seconds)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Temporal service is not ready.",
        ) from exc
    if not healthy:
        raise HTTPException(
            status_code=503,
            detail="Temporal service is not ready.",
        )
    return {"status": "ready"}


@app.post(
    "/process_pdf/execute",
    response_model=PDFProcessExecuteResponse,
)
async def execute_pdf(request: PDFProcessRequest):
    workflow_id = f"pdf_pipeline_{uuid.uuid4()}"
    try:
        client = await get_temporal_client()
        result = await client.execute_workflow(
            "PDFPipelineWorkflow",
            args=[
                {
                    "s3_path": request.s3_path,
                    "document_task_queue": settings.pdf_document_task_queue,
                }
            ],
            id=workflow_id,
            task_queue=settings.pdf_orchestration_task_queue,
            result_type=dict,
        )
    except Exception as exc:
        raise _service_error(exc) from exc
    return PDFProcessExecuteResponse(workflow_id=workflow_id, results=result)


@app.post(
    "/process_pdf/start",
    response_model=WorkflowStartResponse,
)
async def start_pdf(request: PDFProcessRequest):
    workflow_id = f"pdf_pipeline_{uuid.uuid4()}"
    try:
        client = await get_temporal_client()
        await client.start_workflow(
            "PDFPipelineWorkflow",
            args=[
                {
                    "s3_path": request.s3_path,
                    "document_task_queue": settings.pdf_document_task_queue,
                }
            ],
            id=workflow_id,
            task_queue=settings.pdf_orchestration_task_queue,
            result_type=dict,
        )
    except Exception as exc:
        raise _service_error(exc) from exc
    return WorkflowStartResponse(workflow_id=workflow_id)


@app.get(
    "/process_pdf/{workflow_id}/status",
    response_model=PDFWorkflowStatusResponse,
)
async def get_pdf_status(workflow_id: str):
    handle, description = await _describe_workflow(workflow_id)
    phase = _terminal_status(description.status)
    if description.status == WES.RUNNING:
        try:
            state = await handle.query("get_status", result_type=dict)
        except Exception as exc:
            raise _service_error(exc) from exc
        phase = state.get("phase", "processing")

    return PDFWorkflowStatusResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        phase=phase,
        result_available=description.status != WES.RUNNING,
    )


@app.get(
    "/process_pdf/{workflow_id}/result",
    response_model=PDFWorkflowResultResponse,
)
async def get_pdf_result(workflow_id: str):
    handle, description = await _describe_workflow(workflow_id)
    if description.status == WES.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="Workflow is still running; poll the status endpoint.",
        )
    if description.status != WES.COMPLETED:
        return PDFWorkflowResultResponse(
            workflow_id=workflow_id,
            execution_status=description.status.name,
            final_status=_terminal_status(description.status),
            error="Workflow ended without a PDF artifact.",
        )

    try:
        result = await handle.result()
    except Exception as exc:
        raise _service_error(exc) from exc
    return PDFWorkflowResultResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        final_status="completed",
        result=PDFArtifactResult.model_validate(result),
    )


@app.post(
    "/contract-review/start",
    response_model=WorkflowStartResponse,
)
async def start_contract_review(request: StartReviewRequest):
    workflow_id = f"contract-review-{uuid.uuid4()}"
    try:
        client = await get_temporal_client()
        await client.start_workflow(
            "ContractReviewWorkflow",
            args=[
                {
                    "s3_paths": request.s3_paths,
                    "max_revisions": request.max_revisions,
                    "document_task_queue": settings.contract_document_task_queue,
                    "llm_task_queue": settings.contract_llm_task_queue,
                }
            ],
            id=workflow_id,
            task_queue=settings.contract_orchestration_task_queue,
        )
    except Exception as exc:
        raise _service_error(exc) from exc
    return WorkflowStartResponse(workflow_id=workflow_id)


@app.get(
    "/contract-review/{workflow_id}/status",
    response_model=ContractWorkflowStatusResponse,
)
async def get_review_status(workflow_id: str):
    handle, description = await _describe_workflow(workflow_id)
    if description.status in (WES.RUNNING, WES.COMPLETED):
        try:
            state = await handle.query("get_status", result_type=dict)
        except Exception as exc:
            if description.status == WES.RUNNING:
                raise _service_error(exc) from exc
            state = {
                "phase": "completed",
                "current_revision": 0,
                "reviewer": "",
                "completeness": "unknown",
                "documents": [],
                "report_available": True,
            }
    else:
        state = {
            "phase": _terminal_status(description.status),
            "current_revision": 0,
            "reviewer": "",
            "completeness": "unknown",
            "documents": [],
            "report_available": False,
        }

    return ContractWorkflowStatusResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        result_available=description.status != WES.RUNNING,
        **state,
    )


@app.get(
    "/contract-review/{workflow_id}/report",
    response_model=ContractReportQueryResponse,
)
async def get_review_report(workflow_id: str):
    handle, description = await _describe_workflow(workflow_id)
    if description.status != WES.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="Workflow is terminal; use the result endpoint.",
        )
    try:
        report = await handle.query("get_report", result_type=dict)
    except Exception as exc:
        raise _service_error(exc) from exc
    return ContractReportQueryResponse(workflow_id=workflow_id, **report)


@app.get(
    "/contract-review/{workflow_id}/result",
    response_model=ContractReviewResultResponse,
)
async def get_review_result(workflow_id: str):
    handle, description = await _describe_workflow(workflow_id)
    if description.status == WES.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="Workflow is still running; poll the status endpoint.",
        )
    if description.status != WES.COMPLETED:
        return ContractReviewResultResponse(
            workflow_id=workflow_id,
            execution_status=description.status.name,
            final_status=_terminal_status(description.status),
            completeness="failed",
            report=None,
            documents=[],
            reviewer="",
            revision_count=0,
            error="Workflow ended without a domain result.",
        )

    try:
        result = await handle.result()
    except Exception as exc:
        raise _service_error(exc) from exc
    return ContractReviewResultResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        **result,
    )


@app.post(
    "/contract-review/{workflow_id}/assign",
    response_model=ReviewActionResponse,
)
async def assign_reviewer(workflow_id: str, request: AssignRequest):
    try:
        client = await get_temporal_client()
        handle = client.get_workflow_handle(workflow_id)
        await handle.signal("assign_reviewer", request.name)
    except Exception as exc:
        raise _service_error(exc) from exc
    return ReviewActionResponse(
        status="accepted",
        message=f"Reviewer '{request.name}' assigned.",
    )


@app.post(
    "/contract-review/{workflow_id}/decision",
    response_model=ReviewActionResponse,
)
async def submit_review_decision(
    workflow_id: str,
    request: ReviewDecisionRequest,
):
    command = request.model_dump()
    try:
        client = await get_temporal_client()
        handle = client.get_workflow_handle(workflow_id)
        message = await handle.execute_update("submit_review", command)
    except WorkflowUpdateFailedError as exc:
        detail = (
            str(exc.cause)
            if exc.cause is not None
            else "Review decision was rejected for the current workflow state."
        )
        raise HTTPException(status_code=409, detail=detail) from exc
    except Exception as exc:
        raise _service_error(exc) from exc
    return ReviewActionResponse(status="accepted", message=message)
