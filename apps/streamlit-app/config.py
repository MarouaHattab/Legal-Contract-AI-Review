from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).with_name(".env")


class StreamlitSettings(BaseSettings):
    """Validated presentation-layer configuration."""

    model_config = SettingsConfigDict(
        env_prefix="DOCUMENT_UI_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_base_url: AnyHttpUrl = "http://127.0.0.1:8000"
    request_timeout_seconds: float = Field(default=10, gt=0, le=60)
    poll_interval_seconds: float = Field(default=3, ge=2, le=60)
    read_attempts: int = Field(default=2, ge=1, le=3)
    workflow_list_limit: int = Field(default=50, ge=1, le=100)
    application_title: str = Field(
        default="Temporal Document Operations",
        min_length=1,
        max_length=80,
    )


@lru_cache(maxsize=1)
def get_streamlit_settings() -> StreamlitSettings:
    return StreamlitSettings()
