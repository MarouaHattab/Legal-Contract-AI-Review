import asyncio
from concurrent.futures import ThreadPoolExecutor

from llm_activities import (
    analyze_contract_artifact,
    revise_contract_report,
    synthesize_contract_report,
)
from settings import get_contract_settings
from temporalio.client import Client
from temporalio.worker import Worker


async def main():
    settings = get_contract_settings()
    temporal_client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    with ThreadPoolExecutor(
        max_workers=settings.llm_worker_concurrency
    ) as activity_executor:
        worker = Worker(
            temporal_client,
            task_queue=settings.llm_task_queue,
            activities=[
                analyze_contract_artifact,
                synthesize_contract_report,
                revise_contract_report,
            ],
            activity_executor=activity_executor,
            max_concurrent_activities=settings.llm_worker_concurrency,
        )

        print(f"LLM worker running on: '{settings.llm_task_queue}'")
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
