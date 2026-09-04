import asyncio

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
    worker = Worker(
        temporal_client,
        task_queue=settings.orchestration_task_queue,
        workflows=[PDFPipelineWorkflow],
        no_remote_activities=True,
        max_concurrent_workflow_tasks=settings.workflow_worker_concurrency,
    )
    print(
        f"Orchestration worker running on: '{settings.orchestration_task_queue}'"
    )
    await worker.run()




if __name__ == "__main__":
    asyncio.run(main())
