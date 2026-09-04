import os
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import urlsplit

import boto3
from dotenv import load_dotenv

load_dotenv()

AWS_ACCESS_KEY_ID = os.environ["AWS_ACCESS_KEY_ID"]
AWS_SECRET_ACCESS_KEY = os.environ["AWS_SECRET_ACCESS_KEY"]
AWS_REGION = os.environ["AWS_REGION"]
AWS_S3_ENDPOINT_URL = os.environ["AWS_S3_ENDPOINT_URL"]
S3_BUCKET = os.environ["S3_BUCKET"]
TEMP_DIR = os.environ["TEMP_DIR"]

os.makedirs(TEMP_DIR, exist_ok=True)

# ── Input / Output dataclasses ────────────────────────────────────────────────
# Temporal serializes these to/from JSON automatically.

@dataclass(frozen=True)
class ArtifactReference:
    s3_path: str
    sha256: str
    size_bytes: int
    content_type: str


@dataclass(frozen=True)
class ConvertPDFInput:
    s3_path: str


@dataclass(frozen=True)
class ConvertPDFOutput:
    artifact: ArtifactReference


# ── S3 helper ────────────────────────────────────────────────────────────────

def get_s3_client():
    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        endpoint_url=AWS_S3_ENDPOINT_URL,
    )

def parse_s3_path(s3_path: str) -> tuple[str, str]:
    """Return the bucket and key from a strict S3 URI."""
    parsed = urlsplit(s3_path)
    key = parsed.path.removeprefix("/")

    if (
        parsed.scheme != "s3"
        or not parsed.netloc
        or not key
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
        or parsed.port
    ):
        raise ValueError(f"Invalid S3 URI: {s3_path!r}")

    return parsed.netloc, key


def derive_markdown_key(
    source_key: str,
    output_prefix: str = "derived/markdown",
) -> str:
    """Build a Markdown key without ever reusing the source PDF key."""
    source_path = PurePosixPath(source_key)
    if (
        not source_key
        or source_key.startswith("/")
        or not source_path.name
        or source_path.name.lower() == ".pdf"
        or source_path.suffix.lower() != ".pdf"
    ):
        raise ValueError(f"Expected a PDF object key, got: {source_key!r}")

    prefix = PurePosixPath(output_prefix)
    output_key = str(prefix / source_path.with_suffix(".md"))
    if output_key == source_key:
        raise ValueError("Markdown output key must differ from the source PDF key")

    return output_key
