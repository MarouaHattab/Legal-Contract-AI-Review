from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).with_name(".env")


class APISettings(BaseSettings):
    """Validated routing and upload configuration for the API service."""

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
    aws_access_key_id: SecretStr | None = Field(
        default=None,
        validation_alias="AWS_ACCESS_KEY_ID",
    )
    aws_secret_access_key: SecretStr | None = Field(
        default=None,
        validation_alias="AWS_SECRET_ACCESS_KEY",
    )
    aws_region: str | None = Field(
        default=None,
        validation_alias="AWS_REGION",
        min_length=1,
    )
    s3_endpoint_url: str | None = Field(
        default=None,
        validation_alias="AWS_S3_ENDPOINT_URL",
        min_length=1,
    )
    s3_bucket: str | None = Field(
        default=None,
        validation_alias="S3_BUCKET",
        min_length=1,
    )
    upload_prefix: str = Field(
        default="uploads",
        validation_alias="S3_UPLOAD_PREFIX",
        min_length=1,
        max_length=256,
    )
    upload_max_files: int = Field(
        default=20,
        validation_alias="PDF_UPLOAD_MAX_FILES",
        ge=1,
        le=20,
    )
    upload_max_bytes: int = Field(
        default=52_428_800,
        validation_alias="PDF_UPLOAD_MAX_BYTES",
        ge=1_024,
        le=104_857_600,
    )
    artifact_preview_max_bytes: int = Field(
        default=2_097_152,
        validation_alias="MARKDOWN_PREVIEW_MAX_BYTES",
        ge=1_024,
        le=10_485_760,
    )
    s3_connect_timeout_seconds: float = Field(
        default=10,
        validation_alias="S3_CONNECT_TIMEOUT_SECONDS",
        gt=0,
        le=60,
    )
    s3_read_timeout_seconds: float = Field(
        default=60,
        validation_alias="S3_READ_TIMEOUT_SECONDS",
        gt=0,
        le=300,
    )


@lru_cache(maxsize=1)
def get_api_settings() -> APISettings:
    return APISettings()
