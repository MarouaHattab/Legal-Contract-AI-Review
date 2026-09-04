import asyncio
from concurrent.futures import ThreadPoolExecutor

from activities import convert_pdf_to_markdown
from settings import get_pdf_settings
from temporalio.client import Client
from temporalio.worker import Worker


async def main():
    settings = get_pdf_settings()
    temporal_client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    with ThreadPoolExecutor(
        max_workers=settings.document_worker_concurrency
    ) as activity_executor:
        worker = Worker(
            temporal_client,
            task_queue=settings.document_task_queue,
            activities=[convert_pdf_to_markdown],
            activity_executor=activity_executor,
            max_concurrent_activities=settings.document_worker_concurrency,
        )

        print(f"Document worker running on: '{settings.document_task_queue}'")
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
