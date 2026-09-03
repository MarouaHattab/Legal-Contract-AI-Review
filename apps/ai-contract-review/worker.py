import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

from activities import (
    analyze_contract_artifact,
    extract_contract_artifact,
    revise_contract_report,
    synthesize_contract_report,
)
from child_workflow import PDFSummaryWorkflow
from parent_workflow import ContractReviewWorkflow

load_dotenv()
from helpers import (
    TEMPORAL_HOST,
    TEMPORAL_NAMESPACE,
    TEMPORAL_TASK_QUEUE,
)

async def main():

    temporal_client = await Client.connect(TEMPORAL_HOST, 
                                           namespace=TEMPORAL_NAMESPACE)
    
    with ThreadPoolExecutor(max_workers=8) as activity_executor:
        worker = Worker(
            temporal_client,
            task_queue=TEMPORAL_TASK_QUEUE,
            workflows=[ContractReviewWorkflow, PDFSummaryWorkflow],
            activities=[
                extract_contract_artifact,
                analyze_contract_artifact,
                synthesize_contract_report,
                revise_contract_report,
            ],
            activity_executor=activity_executor,
        )

        print(f"Worker running on: '{TEMPORAL_TASK_QUEUE}'")
        await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
