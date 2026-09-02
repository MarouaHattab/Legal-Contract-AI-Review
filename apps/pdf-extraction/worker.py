import asyncio
import logging
import os 

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from workflow_process_pdf import PDFPipelineWorkflow
from activities import (download_pdf, extract_to_markdown, upload_markdown)

load_dotenv()

TEMPORAL_HOST = os.environ["TEMPORAL_HOST"]
TEMPORAL_NAMESPACE = os.environ["TEMPORAL_NAMESPACE"]
TEMPORAL_PDF_PROCESS_TASK_QUEUE = os.environ["TEMPORAL_PDF_PROCESS_TASK_QUEUE"]


async def main():
    temporal_client = await Client.connect(
        TEMPORAL_HOST,
        namespace=TEMPORAL_NAMESPACE
    )
    worker_pdf_process = Worker(
        temporal_client,
        task_queue=TEMPORAL_PDF_PROCESS_TASK_QUEUE,
        workflows=[PDFPipelineWorkflow],
        activities=[download_pdf, extract_to_markdown, upload_markdown]
    )
    print(f"Worker for task queue '{TEMPORAL_PDF_PROCESS_TASK_QUEUE}' started. Listening for workflow tasks...")
    await worker_pdf_process.run()




if __name__ == "__main__":
    asyncio.run(main())