from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlsplit

from botocore.exceptions import BotoCoreError, ClientError

MARKDOWN_CONTENT_TYPES = frozenset({"text/markdown", "text/plain"})


class MarkdownArtifactValidationError(ValueError):
    pass


class MarkdownArtifactNotFoundError(FileNotFoundError):
    pass


class MarkdownArtifactStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class MarkdownArtifact:
    content: str
    filename: str


def validate_s3_markdown_uri(uri: str) -> tuple[str, str]:
    try:
        parsed = urlsplit(uri)
        key = parsed.path.removeprefix("/")
        has_port = parsed.port is not None
    except ValueError as exc:
        raise MarkdownArtifactValidationError(
            "Must be a valid s3://bucket/key.md URI."
        ) from exc

    if (
        parsed.scheme != "s3"
        or not parsed.netloc
        or not key
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
        or has_port
        or PurePosixPath(key).suffix.lower() != ".md"
    ):
        raise MarkdownArtifactValidationError(
            "Must be a valid s3://bucket/key.md URI."
        )
    return parsed.netloc, key


def _is_markdown_content_type(value: object) -> bool:
    if not value:
        return True
    media_type = str(value).split(";", 1)[0].strip().lower()
    return media_type in MARKDOWN_CONTENT_TYPES


def read_markdown_artifact(
    uri: str,
    *,
    s3_client: Any,
    max_bytes: int,
) -> MarkdownArtifact:
    bucket, key = validate_s3_markdown_uri(uri)
    try:
        metadata = s3_client.head_object(Bucket=bucket, Key=key)
        if int(metadata.get("ContentLength", 0)) > max_bytes:
            raise MarkdownArtifactValidationError(
                "Markdown artifact is too large to preview."
            )
        if not _is_markdown_content_type(metadata.get("ContentType")):
            raise MarkdownArtifactValidationError(
                "S3 object is not a Markdown text artifact."
            )
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read(max_bytes + 1)
    except MarkdownArtifactValidationError:
        raise
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise MarkdownArtifactNotFoundError(
                "Markdown artifact was not found."
            ) from exc
        raise MarkdownArtifactStorageError(
            "Markdown artifact could not be loaded."
        ) from exc
    except (BotoCoreError, KeyError, TypeError, ValueError) as exc:
        raise MarkdownArtifactStorageError(
            "Markdown artifact could not be loaded."
        ) from exc

    if len(body) > max_bytes:
        raise MarkdownArtifactValidationError(
            "Markdown artifact is too large to preview."
        )
    try:
        content = body.decode("utf-8")
    except (AttributeError, UnicodeDecodeError) as exc:
        raise MarkdownArtifactValidationError(
            "Markdown artifact is not valid UTF-8 text."
        ) from exc
    return MarkdownArtifact(content=content, filename=PurePosixPath(key).name)
