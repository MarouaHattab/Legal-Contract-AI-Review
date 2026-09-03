import hashlib
import logging
import tempfile
from pathlib import Path

import pymupdf4llm
from temporalio import activity
from temporalio.exceptions import ApplicationError

from helpers import (
    ArtifactReference,
    ConvertPDFInput,
    ConvertPDFOutput,
    TEMP_DIR,
    derive_markdown_key,
    get_s3_client,
    parse_s3_path,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


@activity.defn
def convert_pdf_to_markdown(params: ConvertPDFInput) -> ConvertPDFOutput:
    """Download, convert, and persist a PDF without exposing local paths."""
    try:
        bucket, key = parse_s3_path(params.s3_path)
        markdown_key = derive_markdown_key(key)
    except ValueError as exc:
        raise ApplicationError(
            str(exc),
            type="InvalidPDFInput",
            non_retryable=True,
        ) from exc

    temp_root = Path(TEMP_DIR)
    temp_root.mkdir(parents=True, exist_ok=True)
    s3_client = get_s3_client()
    activity.logger.info("Processing PDF artifact: %s", params.s3_path)

    with tempfile.TemporaryDirectory(prefix="temporal-pdf-", dir=temp_root) as work_dir:
        local_path = Path(work_dir) / "source.pdf"
        s3_client.download_file(bucket, key, str(local_path))
        markdown_text = pymupdf4llm.to_markdown(str(local_path))
        markdown_bytes = markdown_text.encode("utf-8")

        if markdown_key == key:
            raise ApplicationError(
                "Refusing to overwrite the source PDF object",
                type="UnsafeOutputKey",
                non_retryable=True,
            )

        s3_client.put_object(
            Bucket=bucket,
            Key=markdown_key,
            Body=markdown_bytes,
            ContentType="text/markdown",
        )

    output_path = f"s3://{bucket}/{markdown_key}"
    activity.logger.info("Markdown artifact uploaded: %s", output_path)
    return ConvertPDFOutput(
        artifact=ArtifactReference(
            s3_path=output_path,
            sha256=hashlib.sha256(markdown_bytes).hexdigest(),
            size_bytes=len(markdown_bytes),
            content_type="text/markdown",
        )
    )
