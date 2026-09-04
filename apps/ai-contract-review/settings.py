from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).with_name(".env")


class ContractSettings(BaseSettings):
    """Validated runtime configuration for the contract-review service."""

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
    orchestration_task_queue: str = Field(
        default="contract-review-queue",
        validation_alias=AliasChoices(
            "TEMPORAL_CONTRACT_REVIEW_TASK_QUEUE",
            "TEMPORAL_TASK_QUEUE",
        ),
        min_length=1,
    )
    document_task_queue: str = Field(
        default="contract-document-processing-queue",
        validation_alias="TEMPORAL_CONTRACT_DOCUMENT_TASK_QUEUE",
        min_length=1,
    )
    llm_task_queue: str = Field(
        default="contract-llm-queue",
        validation_alias="TEMPORAL_CONTRACT_LLM_TASK_QUEUE",
        min_length=1,
    )

    aws_access_key_id: SecretStr = Field(validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: SecretStr = Field(
        validation_alias="AWS_SECRET_ACCESS_KEY"
    )
    aws_region: str = Field(validation_alias="AWS_REGION", min_length=1)
    s3_endpoint_url: str = Field(
        validation_alias="AWS_S3_ENDPOINT_URL",
        min_length=1,
    )
    s3_bucket: str | None = Field(default=None, validation_alias="S3_BUCKET")
    temp_dir: Path = Field(validation_alias="TEMP_DIR")

    openrouter_api_key: SecretStr = Field(validation_alias="OPENROUTER_API_KEY")
    llm_base_url: str = Field(validation_alias="BASE_URL", min_length=1)
    llm_model: str = Field(
        default="openai/gpt-4o-mini",
        validation_alias="OPENROUTER_MODEL",
        min_length=1,
    )

    workflow_worker_concurrency: int = Field(
        default=50,
        validation_alias="CONTRACT_WORKFLOW_WORKER_CONCURRENCY",
        ge=1,
        le=1_000,
    )
    document_worker_concurrency: int = Field(
        default=2,
        validation_alias="CONTRACT_DOCUMENT_WORKER_CONCURRENCY",
        ge=1,
        le=32,
    )
    llm_worker_concurrency: int = Field(
        default=2,
        validation_alias="CONTRACT_LLM_WORKER_CONCURRENCY",
        ge=1,
        le=32,
    )
    s3_connect_timeout_seconds: float = Field(
        default=10,
        validation_alias="S3_CONNECT_TIMEOUT_SECONDS",
        gt=0,
        le=120,
    )
    s3_read_timeout_seconds: float = Field(
        default=60,
        validation_alias="S3_READ_TIMEOUT_SECONDS",
        gt=0,
        le=600,
    )
    llm_request_timeout_seconds: float = Field(
        default=60,
        validation_alias="LLM_REQUEST_TIMEOUT_SECONDS",
        gt=0,
        le=600,
    )
    temporal_metrics_bind_address: str | None = Field(
        default=None,
        validation_alias="TEMPORAL_METRICS_BIND_ADDRESS",
    )
    worker_build_id: str = Field(
        default="temporal-101-phase-2",
        validation_alias="TEMPORAL_WORKER_BUILD_ID",
        min_length=1,
    )
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        validation_alias="LOG_LEVEL",
    )


@lru_cache(maxsize=1)
def get_contract_settings() -> ContractSettings:
    return ContractSettings()
