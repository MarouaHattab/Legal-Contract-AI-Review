import json
import urllib.error
import urllib.request
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
    openrouter_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="OPENROUTER_API_KEY",
    )
    llm_base_url: str | None = Field(
        default=None,
        validation_alias="BASE_URL",
        min_length=1,
    )
    llm_model: str | None = Field(
        default=None,
        validation_alias="OPENROUTER_MODEL",
        min_length=1,
    )
    llm_request_timeout_seconds: float | None = Field(
        default=None,
        validation_alias="LLM_REQUEST_TIMEOUT_SECONDS",
        gt=0,
        le=600,
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
    cors_origins: str = Field(
        default=(
            "http://localhost:8501,http://127.0.0.1:8501,"
            "http://localhost:5173,http://127.0.0.1:5173"
        ),
        validation_alias="CORS_ORIGINS",
    )


@lru_cache(maxsize=1)
def get_api_settings() -> APISettings:
    return APISettings()


class LLMRuntimeOverlay:
    """Process-local LLM values. Never written to disk or Temporal history."""

    def __init__(self) -> None:
        self.api_key: SecretStr | None = None
        self.model: str | None = None
        self.base_url: str | None = None
        self.request_timeout_seconds: float | None = None


_llm_overlay = LLMRuntimeOverlay()


def get_llm_overlay() -> LLMRuntimeOverlay:
    return _llm_overlay


def api_key_hint(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) < 8:
        return "configured"
    return f"••••{secret[-4:]}"


def resolved_llm_settings() -> dict[str, object]:
    settings = get_api_settings()
    overlay = get_llm_overlay()
    env_key = (
        settings.openrouter_api_key.get_secret_value()
        if settings.openrouter_api_key is not None
        else ""
    )
    overlay_key = (
        overlay.api_key.get_secret_value() if overlay.api_key is not None else ""
    )
    secret = overlay_key or env_key
    timeout = overlay.request_timeout_seconds
    if timeout is None:
        timeout = settings.llm_request_timeout_seconds
    return {
        "model": overlay.model or settings.llm_model or "",
        "base_url": overlay.base_url or settings.llm_base_url or "",
        "request_timeout_seconds": timeout,
        "api_key_configured": bool(secret),
        "api_key_hint": api_key_hint(secret),
    }


def update_llm_overlay(
    *,
    model: str | None = None,
    base_url: str | None = None,
    request_timeout_seconds: float | None = None,
    api_key: str | None = None,
) -> dict[str, object]:
    overlay = get_llm_overlay()
    if model is not None:
        overlay.model = model
    if base_url is not None:
        overlay.base_url = base_url
    if request_timeout_seconds is not None:
        overlay.request_timeout_seconds = request_timeout_seconds
    if api_key is not None:
        overlay.api_key = SecretStr(api_key)
    return resolved_llm_settings()


def _resolved_api_key() -> str:
    overlay = get_llm_overlay()
    if overlay.api_key is not None:
        return overlay.api_key.get_secret_value()
    settings = get_api_settings()
    if settings.openrouter_api_key is not None:
        return settings.openrouter_api_key.get_secret_value()
    return ""


class LLMProbeError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


def probe_llm_connection(
    *,
    model: str | None = None,
    base_url: str | None = None,
    request_timeout_seconds: float | None = None,
    api_key: str | None = None,
) -> dict[str, object]:
    snapshot = resolved_llm_settings()
    secret = api_key or _resolved_api_key()
    resolved_model = model or str(snapshot.get("model") or "")
    resolved_base = (base_url or str(snapshot.get("base_url") or "")).rstrip("/")
    timeout = request_timeout_seconds or snapshot.get("request_timeout_seconds") or 15
    if not secret:
        raise LLMProbeError("API key is not configured.", status_code=422)
    if not resolved_base:
        raise LLMProbeError("Base URL is not configured.", status_code=422)

    request = urllib.request.Request(
        f"{resolved_base}/models",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {secret}",
            "HTTP-Referer": "http://localhost:8501",
            "X-Title": "AI Contract Review",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=float(timeout)) as response:
            raw = response.read(2_000_000)
            if response.status != 200:
                raise LLMProbeError(
                    "The LLM provider did not accept the request.",
                    status_code=503,
                )
    except LLMProbeError:
        raise
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise LLMProbeError("The API key was rejected.", status_code=422) from exc
        raise LLMProbeError(
            "The LLM provider did not accept the request.",
            status_code=503,
        ) from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise LLMProbeError(
            "The LLM provider could not be reached.",
            status_code=503,
        ) from exc

    message = "The provider accepted the API key."
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = None
    models = []
    if isinstance(payload, dict):
        raw_models = payload.get("data", [])
        if isinstance(raw_models, list):
            models = [
                str(item.get("id", ""))
                for item in raw_models
                if isinstance(item, dict) and item.get("id")
            ]
    if resolved_model and models:
        if resolved_model in models:
            message = f"The provider accepted the API key. Model {resolved_model} is available."
        else:
            message = (
                f"The provider accepted the API key. Model {resolved_model} "
                "was not listed by /models."
            )
    return {
        "ok": True,
        "message": message,
        "model": resolved_model,
        "base_url": resolved_base,
    }
