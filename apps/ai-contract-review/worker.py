import asyncio
from concurrent.futures import ThreadPoolExecutor

from activities import (
    analyze_contract_artifact,
    extract_contract_artifact,
    revise_contract_report,
    synthesize_contract_report,
)
from child_workflow import PDFSummaryWorkflow
from parent_workflow import ContractReviewWorkflow
from settings import get_contract_settings
from temporalio.client import Client
from temporalio.worker import Worker


async def main():
    settings = get_contract_settings()
    temporal_client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )
    
    with ThreadPoolExecutor(max_workers=8) as activity_executor:
        worker = Worker(
            temporal_client,
            task_queue=settings.orchestration_task_queue,
            workflows=[ContractReviewWorkflow, PDFSummaryWorkflow],
            activities=[
                extract_contract_artifact,
                analyze_contract_artifact,
                synthesize_contract_report,
                revise_contract_report,
            ],
            activity_executor=activity_executor,
        )

        print(f"Worker running on: '{settings.orchestration_task_queue}'")
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
