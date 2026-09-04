import asyncio
from concurrent.futures import ThreadPoolExecutor

from activities import convert_pdf_to_markdown
from settings import get_pdf_settings
from temporalio.client import Client
from temporalio.worker import Worker
from workflow_process_pdf import PDFPipelineWorkflow


async def main():
    settings = get_pdf_settings()
    temporal_client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )
    with ThreadPoolExecutor(
        max_workers=settings.document_worker_concurrency
    ) as activity_executor:
        worker_pdf_process = Worker(
            temporal_client,
            task_queue=settings.orchestration_task_queue,
            workflows=[PDFPipelineWorkflow],
            activities=[convert_pdf_to_markdown],
            activity_executor=activity_executor,
            max_concurrent_workflow_tasks=settings.workflow_worker_concurrency,
            max_concurrent_activities=settings.document_worker_concurrency,
        )
        print(
            f"Worker for task queue '{settings.orchestration_task_queue}' started. "
            "Listening for tasks..."
        )
        await worker_pdf_process.run()




if __name__ == "__main__":
    asyncio.run(main())
