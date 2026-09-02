
import os
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.client import WorkflowExecutionStatus as WES

load_dotenv()

TEMPORAL_HOST      = os.environ["TEMPORAL_HOST"]
TEMPORAL_NAMESPACE = os.environ["TEMPORAL_NAMESPACE"]
TEMPORAL_PDF_PROCESS_TASK_QUEUE = os.environ["TEMPORAL_PDF_PROCESS_TASK_QUEUE"]
TEMPORAL_CONTRACT_REVIEW_TASK_QUEUE = os.environ["TEMPORAL_CONTRACT_REVIEW_TASK_QUEUE"]

app = FastAPI(
    title="PDF Extraction Client",
    description="Submits PDF processing jobs to Temporal and returns the result.",
    version="1.0.0",
)

class PDFProcessRequest(BaseModel):
    s3_path: str

class PDFProcessExecuteResponse(BaseModel):
    workflow_id: str
    results: dict

class PDFProcessStartResponse(BaseModel):
    workflow_id: str


async def get_temporal_client() -> Client:
    return await Client.connect(
        TEMPORAL_HOST,
        namespace=TEMPORAL_NAMESPACE,
    )


# routes 

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/process_pdf/execute",response_model=PDFProcessExecuteResponse)
async def process_pdf(request: PDFProcessRequest):
    workflow_id = f"pdf_pipeline_{uuid.uuid4()}"
    client = await get_temporal_client()

    result = await client.execute_workflow(
        "PDFPipelineWorkflow",
        args =[
          {
            "s3_path": request.s3_path,
          }
        ], 
        id=workflow_id,
        task_queue=TEMPORAL_PDF_PROCESS_TASK_QUEUE,
        result_type=dict,
    )

    return PDFProcessExecuteResponse(workflow_id=workflow_id, results=result)


@app.post("/process_pdf/start",response_model=PDFProcessStartResponse)
async def process_pdf(request: PDFProcessRequest):
    workflow_id = f"pdf_pipeline_{uuid.uuid4()}"
    client = await get_temporal_client()

    result = await client.start_workflow(
        "PDFPipelineWorkflow",
        args =[
          {
            "s3_path": request.s3_path,
          }
        ], 
        id=workflow_id,
        task_queue=TEMPORAL_PDF_PROCESS_TASK_QUEUE,
        result_type=dict,
    )

    return PDFProcessStartResponse(workflow_id=workflow_id)


@app.get("/process_pdf/status/{workflow_id}")
async def get_workflow_status(workflow_id:str):
    client = await get_temporal_client()
    handle = client.get_workflow_handle(workflow_id)
    desc= await handle.describe()
    workflow_status = desc.status

    return {
        "workflow_id": workflow_id, 
        "status": workflow_status.name
            }