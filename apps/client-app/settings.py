from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).with_name(".env")


class APISettings(BaseSettings):
    """Validated Temporal routing configuration for the API service."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    temporal_host: str = Field(validation_alias="TEMPORAL_HOST", min_length=1)
    temporal_namespace: str = Field(
        validation_alias="TEMPORAL_NAMESPACE",
        min_length=1,
    )
    pdf_orchestration_task_queue: str = Field(
        default="pdf-pipeline-queue",
        validation_alias=AliasChoices(
            "TEMPORAL_PDF_ORCHESTRATION_TASK_QUEUE",
            "TEMPORAL_PDF_PROCESS_TASK_QUEUE",
        ),
        min_length=1,
    )
    pdf_document_task_queue: str = Field(
        default="pdf-document-processing-queue",
        validation_alias="TEMPORAL_PDF_DOCUMENT_TASK_QUEUE",
        min_length=1,
    )
    contract_orchestration_task_queue: str = Field(
        default="contract-review-queue",
        validation_alias="TEMPORAL_CONTRACT_REVIEW_TASK_QUEUE",
        min_length=1,
    )
    contract_document_task_queue: str = Field(
        default="contract-document-processing-queue",
        validation_alias="TEMPORAL_CONTRACT_DOCUMENT_TASK_QUEUE",
        min_length=1,
    )
    contract_llm_task_queue: str = Field(
        default="contract-llm-queue",
        validation_alias="TEMPORAL_CONTRACT_LLM_TASK_QUEUE",
        min_length=1,
    )
    temporal_health_timeout_seconds: float = Field(
        default=3,
        validation_alias="TEMPORAL_HEALTH_TIMEOUT_SECONDS",
        gt=0,
        le=30,
    )
    enable_search_attributes: bool = Field(
        default=False,
        validation_alias="TEMPORAL_ENABLE_SEARCH_ATTRIBUTES",
    )


@lru_cache(maxsize=1)
def get_api_settings() -> APISettings:
    return APISettings()
