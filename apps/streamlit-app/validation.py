import hashlib
import json
from collections.abc import Mapping
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlsplit

MAX_CONTRACT_DOCUMENTS = 20


class InputError(ValueError):
    pass


def validate_s3_pdf_uri(value: str) -> str:
    normalized = value.strip()
    try:
        parsed = urlsplit(normalized)
        key = parsed.path.removeprefix("/")
        has_port = parsed.port is not None
    except ValueError as exc:
        raise InputError("Use a valid s3://bucket/key.pdf URI.") from exc

    if (
        parsed.scheme != "s3"
        or not parsed.netloc
        or not key
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
        or has_port
        or PurePosixPath(key).suffix.lower() != ".pdf"
    ):
        raise InputError("Use a valid s3://bucket/key.pdf URI.")
    return normalized


def parse_contract_paths(value: str) -> list[str]:
    raw_paths = [line.strip() for line in value.splitlines() if line.strip()]
    if not raw_paths:
        raise InputError("Enter at least one S3 PDF URI.")
    if len(raw_paths) > MAX_CONTRACT_DOCUMENTS:
        raise InputError(f"Enter no more than {MAX_CONTRACT_DOCUMENTS} documents.")

    paths = [validate_s3_pdf_uri(path) for path in raw_paths]
    if len(set(paths)) != len(paths):
        raise InputError("Duplicate contract documents are not allowed.")
    return paths


def submission_fingerprint(
    workflow_type: str,
    payload: Mapping[str, Any],
) -> str:
    canonical = json.dumps(
        {"workflow_type": workflow_type, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
