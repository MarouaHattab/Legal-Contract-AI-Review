import asyncio
import hashlib
import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

logger = logging.getLogger(__name__)

PDF_CONTENT_TYPE = "application/pdf"
PDF_SIGNATURE = b"%PDF-"
READ_CHUNK_SIZE = 1024 * 1024
MAX_FILENAME_LENGTH = 255
SAFE_STEM_LENGTH = 180
UNSAFE_FILENAME_CHARACTERS = re.compile(r"[^A-Za-z0-9_-]+")


class PDFUploadValidationError(ValueError):
    pass


class PDFUploadStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidatedPDF:
    upload: UploadFile
    filename: str
    safe_filename: str
    size_bytes: int
    sha256: str


def create_s3_client(settings: Any):
    client_options: dict[str, Any] = {
        "region_name": settings.aws_region,
        "endpoint_url": settings.s3_endpoint_url,
        "config": Config(
            connect_timeout=settings.s3_connect_timeout_seconds,
            read_timeout=settings.s3_read_timeout_seconds,
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    }
    if settings.aws_access_key_id is not None:
        client_options["aws_access_key_id"] = (
            settings.aws_access_key_id.get_secret_value()
        )
    if settings.aws_secret_access_key is not None:
        client_options["aws_secret_access_key"] = (
            settings.aws_secret_access_key.get_secret_value()
        )
    return boto3.client("s3", **client_options)


def _safe_pdf_filename(filename: str) -> tuple[str, str]:
    basename = PurePosixPath(filename.replace("\\", "/")).name.strip()
    if not basename or len(basename) > MAX_FILENAME_LENGTH:
        raise PDFUploadValidationError(
            "Each upload must have a filename no longer than 255 characters."
        )
    if PurePosixPath(basename).suffix.lower() != ".pdf":
        raise PDFUploadValidationError("Each uploaded filename must end in .pdf.")

    safe_stem = UNSAFE_FILENAME_CHARACTERS.sub("_", basename[:-4]).strip("_-")
    if not safe_stem:
        safe_stem = "document"
    return basename, f"{safe_stem[:SAFE_STEM_LENGTH]}.pdf"


async def _validate_pdf(upload: UploadFile, max_bytes: int) -> ValidatedPDF:
    filename, safe_filename = _safe_pdf_filename(upload.filename or "")
    if upload.content_type != PDF_CONTENT_TYPE:
        raise PDFUploadValidationError(
            f"{filename} must use the application/pdf content type."
        )

    digest = hashlib.sha256()
    size_bytes = 0
    signature = b""
    await upload.seek(0)
    try:
        while chunk := await upload.read(READ_CHUNK_SIZE):
            if not signature:
                signature = chunk[: len(PDF_SIGNATURE)]
            size_bytes += len(chunk)
            if size_bytes > max_bytes:
                raise PDFUploadValidationError(
                    f"{filename} exceeds the {max_bytes} bytes per-file limit."
                )
            digest.update(chunk)
    finally:
        await upload.seek(0)

    if signature != PDF_SIGNATURE:
        raise PDFUploadValidationError(
            f"{filename} does not contain a valid PDF signature."
        )
    return ValidatedPDF(
        upload=upload,
        filename=filename,
        safe_filename=safe_filename,
        size_bytes=size_bytes,
        sha256=digest.hexdigest(),
    )


def _upload_one(s3_client: Any, bucket: str, key: str, pdf: ValidatedPDF) -> None:
    pdf.upload.file.seek(0)
    s3_client.upload_fileobj(
        pdf.upload.file,
        bucket,
        key,
        ExtraArgs={
            "ContentType": PDF_CONTENT_TYPE,
            "Metadata": {"sha256": pdf.sha256},
        },
    )


async def _rollback_uploads(
    s3_client: Any,
    bucket: str,
    object_keys: list[str],
) -> None:
    for key in object_keys:
        try:
            await asyncio.to_thread(
                s3_client.delete_object,
                Bucket=bucket,
                Key=key,
            )
        except (BotoCoreError, ClientError):
            logger.warning(
                "pdf_upload_rollback_failed",
                extra={"s3_bucket": bucket, "s3_object_key": key},
                exc_info=True,
            )
            continue


async def upload_pdf_batch(
    uploads: list[UploadFile],
    *,
    settings: Any,
    s3_client: Any,
) -> list[dict[str, Any]]:
    if not uploads:
        raise PDFUploadValidationError("Upload at least one PDF file.")
    if len(uploads) > settings.upload_max_files:
        raise PDFUploadValidationError(
            f"Upload at most {settings.upload_max_files} PDF files per request."
        )
    if not settings.s3_bucket:
        raise PDFUploadStorageError("PDF upload storage is not configured.")

    validated = [
        await _validate_pdf(upload, settings.upload_max_bytes) for upload in uploads
    ]
    prefix = settings.upload_prefix.strip("/")
    completed_keys: list[str] = []
    results: list[dict[str, Any]] = []

    try:
        for pdf in validated:
            object_key = f"{prefix}/{uuid.uuid4()}/{pdf.safe_filename}"
            await asyncio.to_thread(
                _upload_one,
                s3_client,
                settings.s3_bucket,
                object_key,
                pdf,
            )
            completed_keys.append(object_key)
            results.append(
                {
                    "filename": pdf.filename,
                    "s3_uri": f"s3://{settings.s3_bucket}/{object_key}",
                    "object_key": object_key,
                    "size_bytes": pdf.size_bytes,
                    "sha256": pdf.sha256,
                    "content_type": PDF_CONTENT_TYPE,
                }
            )
    except Exception as exc:
        await _rollback_uploads(s3_client, settings.s3_bucket, completed_keys)
        raise PDFUploadStorageError(
            "PDF upload failed. No workflow was started."
        ) from exc

    return results
