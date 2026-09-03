import asyncio
import logging
import os 
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from workflow_process_pdf import PDFPipelineWorkflow
from activities import convert_pdf_to_markdown

load_dotenv()

TEMPORAL_HOST = os.environ["TEMPORAL_HOST"]
TEMPORAL_NAMESPACE = os.environ["TEMPORAL_NAMESPACE"]
TEMPORAL_PDF_PROCESS_TASK_QUEUE = os.environ["TEMPORAL_PDF_PROCESS_TASK_QUEUE"]


async def main():
    temporal_client = await Client.connect(
        TEMPORAL_HOST,
        namespace=TEMPORAL_NAMESPACE
    )
    with ThreadPoolExecutor(max_workers=4) as activity_executor:
        worker_pdf_process = Worker(
            temporal_client,
            task_queue=TEMPORAL_PDF_PROCESS_TASK_QUEUE,
            workflows=[PDFPipelineWorkflow],
            activities=[convert_pdf_to_markdown],
            activity_executor=activity_executor,
        )
        print(f"Worker for task queue '{TEMPORAL_PDF_PROCESS_TASK_QUEUE}' started. Listening for workflow tasks...")
        await worker_pdf_process.run()




if __name__ == "__main__":
    asyncio.run(main())
