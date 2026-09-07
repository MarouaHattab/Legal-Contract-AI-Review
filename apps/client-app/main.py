import asyncio
import re
import uuid
from collections.abc import Mapping
from contextlib import asynccontextmanager
from datetime import timedelta
from functools import lru_cache
from typing import Annotated, Any

from api_models import (
    AssignRequest,
    ContractReportQueryResponse,
    ContractReviewResultResponse,
    ContractWorkflowStatusResponse,
    LLMConnectionTestResponse,
    LLMSettingsResponse,
    LLMSettingsUpdateRequest,
    OperationalSettingsResponse,
    PDFArtifactResult,
    PDFProcessExecuteResponse,
    PDFProcessRequest,
    PDFUploadResponse,
    PDFWorkflowResultResponse,
    PDFWorkflowStatusResponse,
    ReviewActionResponse,
    ReviewDecisionRequest,
    StartReviewRequest,
    WorkflowListResponse,
    WorkflowStartResponse,
    WorkflowSummaryResponse,
)
from artifact_service import (
    MarkdownArtifactNotFoundError,
    MarkdownArtifactStorageError,
    MarkdownArtifactValidationError,
    read_markdown_artifact,
)
from fastapi import FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from settings import (
    LLMProbeError,
    get_api_settings,
    probe_llm_connection,
    resolved_llm_settings,
    update_llm_overlay,
)
from temporalio.client import Client, WorkflowUpdateFailedError
from temporalio.client import WorkflowExecutionStatus as WES
from temporalio.service import RPCError, RPCStatusCode
from upload_service import (
    PDFUploadStorageError,
    PDFUploadValidationError,
    create_s3_client,
    upload_pdf_batch,
)

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
    version="1.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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


@lru_cache(maxsize=1)
def get_s3_client():
    return create_s3_client(settings)


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


WORKFLOW_TYPE_NAMES = {
    "PDFPipelineWorkflow": "pdf",
    "ContractReviewWorkflow": "contract_review",
}
WORKFLOW_VISIBILITY_QUERY = (
    "WorkflowType = 'PDFPipelineWorkflow' OR WorkflowType = 'ContractReviewWorkflow'"
)


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
    "/uploads/pdfs",
    response_model=PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_pdfs(files: Annotated[list[UploadFile], File()]):
    try:
        uploaded = await upload_pdf_batch(
            files,
            settings=settings,
            s3_client=get_s3_client(),
        )
    except PDFUploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PDFUploadStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PDFUploadResponse(files=uploaded)


@app.get("/artifacts/markdown", response_class=Response)
async def get_markdown_artifact(
    uri: str = Query(min_length=1, max_length=2_048),
    download: bool = False,
):
    try:
        artifact = await asyncio.to_thread(
            read_markdown_artifact,
            uri,
            s3_client=get_s3_client(),
            max_bytes=settings.artifact_preview_max_bytes,
        )
    except MarkdownArtifactValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except MarkdownArtifactNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MarkdownArtifactStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    filename = re.sub(r"[^A-Za-z0-9._-]", "_", artifact.filename)[:255]
    disposition = "attachment" if download else "inline"
    return Response(
        content=artifact.content,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
        },
    )


def _operational_settings() -> OperationalSettingsResponse:
    llm = LLMSettingsResponse.model_validate(resolved_llm_settings())
    return OperationalSettingsResponse(
        s3_configured=bool(settings.s3_bucket and settings.s3_endpoint_url),
        s3_bucket=settings.s3_bucket or "",
        s3_endpoint_url=settings.s3_endpoint_url or "",
        upload_max_files=settings.upload_max_files,
        upload_max_bytes=settings.upload_max_bytes,
        llm=llm,
    )


@app.get("/settings", response_model=OperationalSettingsResponse)
async def get_settings():
    return _operational_settings()


@app.put("/settings/llm", response_model=OperationalSettingsResponse)
async def put_llm_settings(request: Request):
    try:
        payload: dict[str, Any] = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid JSON body.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Invalid JSON body.")

    api_key = payload.pop("api_key", None)
    normalized_key: str | None = None
    if api_key is not None:
        if not isinstance(api_key, str):
            raise HTTPException(status_code=422, detail="API key must be a string.")
        stripped = api_key.strip()
        if stripped:
            if len(stripped) > 500:
                raise HTTPException(status_code=422, detail="API key is too long.")
            normalized_key = stripped

    try:
        update = LLMSettingsUpdateRequest.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Please check the submitted LLM settings.",
        ) from exc

    update_llm_overlay(
        model=update.model,
        base_url=update.base_url,
        request_timeout_seconds=update.request_timeout_seconds,
        api_key=normalized_key,
    )
    return _operational_settings()


@app.post("/settings/llm/test", response_model=LLMConnectionTestResponse)
async def test_llm_settings(request: Request):
    try:
        payload: dict[str, Any] = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid JSON body.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Invalid JSON body.")

    api_key = payload.pop("api_key", None)
    normalized_key: str | None = None
    if isinstance(api_key, str) and api_key.strip():
        if len(api_key.strip()) > 500:
            raise HTTPException(status_code=422, detail="API key is too long.")
        normalized_key = api_key.strip()

    try:
        update = LLMSettingsUpdateRequest.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Please check the submitted LLM settings.",
        ) from exc

    try:
        result = await asyncio.to_thread(
            probe_llm_connection,
            model=update.model,
            base_url=update.base_url,
            request_timeout_seconds=update.request_timeout_seconds,
            api_key=normalized_key,
        )
    except LLMProbeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return LLMConnectionTestResponse.model_validate(result)


@app.get(
    "/workflows",
    response_model=WorkflowListResponse,
)
async def list_workflows(limit: int = Query(default=50, ge=1, le=100)):
    try:
        client = await get_temporal_client()
        executions = client.list_workflows(
            query=WORKFLOW_VISIBILITY_QUERY,
            limit=limit,
            page_size=limit,
        )
        workflows = [
            WorkflowSummaryResponse(
                workflow_id=execution.id,
                run_id=execution.run_id,
                workflow_type=WORKFLOW_TYPE_NAMES[execution.workflow_type],
                execution_status=(
                    execution.status.name if execution.status is not None else "UNKNOWN"
                ),
                start_time=execution.start_time,
                close_time=execution.close_time,
            )
            async for execution in executions
        ]
    except Exception as exc:
        raise _service_error(exc) from exc
    return WorkflowListResponse(workflows=workflows)


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
    try:
        artifact = PDFArtifactResult.model_validate(result)
    except ValidationError:
        return PDFWorkflowResultResponse(
            workflow_id=workflow_id,
            execution_status=description.status.name,
            final_status="failed",
            error="Workflow completed without a compatible PDF artifact.",
        )
    return PDFWorkflowResultResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        final_status="completed",
        result=artifact,
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
                    "markdown_s3_paths": request.markdown_s3_paths,
                    "markdown_sha256s": request.markdown_sha256s,
                    "markdown_size_bytes": request.markdown_size_bytes,
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
    try:
        state = await handle.query("get_status", result_type=dict)
    except Exception as exc:
        if description.status == WES.RUNNING:
            raise _service_error(exc) from exc
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
        try:
            state = await handle.query("get_report", result_type=dict)
            return ContractReviewResultResponse.model_validate(
                {
                    "workflow_id": workflow_id,
                    "execution_status": description.status.name,
                    "final_status": _terminal_status(description.status),
                    "completeness": state.get("completeness") or "failed",
                    "report": state.get("report"),
                    "documents": state.get("documents") or [],
                    "reviewer": state.get("reviewer") or "",
                    "revision_count": state.get("current_revision") or 0,
                    "error": "Workflow ended before human review completed.",
                }
            )
        except (Exception, ValidationError):
            return ContractReviewResultResponse(
                workflow_id=workflow_id,
                execution_status=description.status.name,
                final_status=_terminal_status(description.status),
                completeness="failed",
                report=None,
                documents=[],
                reviewer="",
                revision_count=0,
                error="Workflow ended before human review completed.",
            )

    try:
        result = await handle.result()
    except Exception as exc:
        raise _service_error(exc) from exc
    if isinstance(result, Mapping):
        try:
            return ContractReviewResultResponse.model_validate(
                {
                    "workflow_id": workflow_id,
                    "execution_status": description.status.name,
                    **result,
                }
            )
        except ValidationError:
            pass
    return ContractReviewResultResponse(
        workflow_id=workflow_id,
        execution_status=description.status.name,
        final_status="failed",
        completeness="failed",
        report=None,
        documents=[],
        reviewer="",
        revision_count=0,
        error="Workflow completed without a compatible contract result.",
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
