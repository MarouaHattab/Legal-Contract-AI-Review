
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

class PDFProcessResponse(BaseModel):
    workflow_id: str
    results: dict


async def get_temporal_client() -> Client:
    return await Client.connect(
        target=TEMPORAL_HOST,
        namespace=TEMPORAL_NAMESPACE,
    )


# routes 

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/process_pdf",response_model=PDFProcessResponse)
async def process_pdf(request: PDFProcessRequest):
    workflow_id = f"pdf_pipeline_{uuid.uuid4()}"
    client = await get_temporal_client()

    result = await client.execute_workflow(
        "PDFProcessingWorkflow",
        args =[
          {
            "s3_path": request.s3_path,
          }
        ], 
        id=workflow_id,
        task_queue=TEMPORAL_PDF_PROCESS_TASK_QUEUE,
        result_type=dict,
    )

    return PDFProcessResponse(workflow_id=workflow_id, results=result)