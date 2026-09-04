import hashlib
import math
import tempfile
from pathlib import Path

import fitz
import pymupdf4llm
from helpers import (
    ArtifactReference,
    ExtractContractArtifactOutput,
    ExtractPDFInput,
    derive_contract_artifact_key,
    get_s3_client,
    parse_s3_path,
)
from settings import get_contract_settings
from temporalio import activity
from temporalio.exceptions import ApplicationError


@activity.defn
def extract_contract_artifact(
    params: ExtractPDFInput,
) -> ExtractContractArtifactOutput:
    """Extract a PDF into a durable, content-addressed Markdown artifact."""
    if params.batch_size <= 0:
        raise ApplicationError(
            "batch_size must be positive",
            type="InvalidPDFInput",
            non_retryable=True,
        )

    try:
        bucket, key = parse_s3_path(params.s3_path)
        if Path(key).suffix.lower() != ".pdf":
            raise ValueError(f"Expected a PDF object key, got: {key!r}")
    except ValueError as exc:
        raise ApplicationError(
            str(exc),
            type="InvalidPDFInput",
            non_retryable=True,
        ) from exc

    temp_root = get_contract_settings().temp_dir
    temp_root.mkdir(parents=True, exist_ok=True)
    s3_client = get_s3_client()

    with tempfile.TemporaryDirectory(
        prefix="temporal-contract-",
        dir=temp_root,
    ) as work_dir:
        local_path = Path(work_dir) / "source.pdf"
        activity.heartbeat(
            {"stage": "downloading", "s3_path": params.s3_path, "pages_done": 0}
        )
        s3_client.download_file(bucket, key, str(local_path))

        with fitz.open(str(local_path)) as document:
            total_pages = document.page_count

        if total_pages <= 0:
            raise ApplicationError(
                "PDF contains no pages",
                type="EmptyContract",
                non_retryable=True,
            )

        all_text_chunks: list[str] = []
        num_batches = math.ceil(total_pages / params.batch_size)
        for batch_index in range(num_batches):
            start_page = batch_index * params.batch_size
            end_page = min(start_page + params.batch_size, total_pages)
            all_text_chunks.append(
                pymupdf4llm.to_markdown(
                    str(local_path),
                    pages=list(range(start_page, end_page)),
                )
            )
            activity.heartbeat(
                {
                    "stage": "extracting",
                    "s3_path": params.s3_path,
                    "pages_done": end_page,
                    "total_pages": total_pages,
                }
            )

        markdown_bytes = "\n".join(all_text_chunks).encode("utf-8")

    digest = hashlib.sha256(markdown_bytes).hexdigest()
    artifact_key = derive_contract_artifact_key(key, digest)
    if artifact_key == key:
        raise ApplicationError(
            "Refusing to overwrite the source PDF object",
            type="UnsafeOutputKey",
            non_retryable=True,
        )

    s3_client.put_object(
        Bucket=bucket,
        Key=artifact_key,
        Body=markdown_bytes,
        ContentType="text/markdown",
    )
    artifact = ArtifactReference(
        s3_path=f"s3://{bucket}/{artifact_key}",
        sha256=digest,
        size_bytes=len(markdown_bytes),
        content_type="text/markdown",
    )
    activity.heartbeat(
        {
            "stage": "done",
            "s3_path": params.s3_path,
            "pages_done": total_pages,
            "artifact": artifact.s3_path,
        }
    )
    return ExtractContractArtifactOutput(
        source_s3_path=params.s3_path,
        artifact=artifact,
        page_count=total_pages,
    )
