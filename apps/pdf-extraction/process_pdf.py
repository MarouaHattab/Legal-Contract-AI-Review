"""
Phase 1: Plain Python PDF-to-Markdown pipeline.

Usage:
    python process_pdf.py s3://my-pdfs-bucket/reports/annual_report.pdf
"""

import logging
import os
import sys
import tempfile
from pathlib import Path

import boto3
import pymupdf4llm
from dotenv import load_dotenv


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
log = logging.getLogger(__name__)

load_dotenv()


AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.environ.get("AWS_REGION")
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL")

TEMP_DIR = os.environ.get("TEMP_DIR", tempfile.gettempdir())

os.makedirs(TEMP_DIR, exist_ok=True)

# S3 helpers
def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
        endpoint_url=AWS_S3_ENDPOINT_URL,
    )


def parse_s3_path(s3_path: str) -> tuple[str, str]:
    if not s3_path.startswith("s3://"):
        raise ValueError(f"Invalid S3 path: {s3_path}")

    s3_path_no_scheme = s3_path.removeprefix("s3://")
    bucket, separator, key = s3_path_no_scheme.partition("/")

    if not separator or not bucket or not key:
        raise ValueError(f"Invalid S3 path: {s3_path}")

    return bucket, key
# Step 1: Download PDF
def download_pdf_from_s3(s3_path: str) -> str:
    bucket, key = parse_s3_path(s3_path)

    filename = Path(key).name
    local_path = str(Path(TEMP_DIR) / filename)

    log.info("Downloading s3://%s/%s to %s", bucket, key, local_path)

    s3_client = get_s3_client()
    s3_client.download_file(
        bucket,
        key,
        local_path,
    )

    log.info("Downloaded %s", local_path)

    return local_path
# Step 2: Extract PDF to Markdown

def extract_pdf_to_markdown(local_pdf_path: str) -> str:
    log.info("Extracting text from %s", local_pdf_path)

    markdown_text = pymupdf4llm.to_markdown(local_pdf_path)

    log.info(
        "Extraction complete, length: %d characters",
        len(markdown_text),
    )

    return markdown_text

# Step 3: Upload Markdown

def upload_markdown(
    markdown_text: str,
    original_s3_path: str,
) -> str:
    bucket, key = parse_s3_path(original_s3_path)

    md_key = str(Path(key).with_suffix(".md"))

    log.info("Uploading Markdown to s3://%s/%s", bucket, md_key)

    s3_client = get_s3_client()

    s3_client.put_object(
        Bucket=bucket,
        Key=md_key,
        Body=markdown_text.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
    )

    output_path = f"s3://{bucket}/{md_key}"

    log.info("Uploaded Markdown to %s", output_path)

    return output_path

# Main Pipeline
def process_pdf(s3_input_path: str) -> str:
    log.info("Starting PDF processing for %s", s3_input_path)

    local_pdf = download_pdf_from_s3(s3_input_path)

    try:
        markdown = extract_pdf_to_markdown(local_pdf)
        output_s3 = upload_markdown(
            markdown,
            s3_input_path,
        )

        log.info(
            "Pipeline complete. Markdown uploaded to %s",
            output_s3,
        )

        return output_s3

    finally:
        if os.path.exists(local_pdf):
            os.remove(local_pdf)
            log.info("Deleted temporary file %s", local_pdf)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            "Usage: python process_pdf.py "
            "s3://bucket/path/file.pdf"
        )
        sys.exit(1)

    output_s3 = process_pdf(sys.argv[1])

    log.info("Pipeline finished. Result: %s", output_s3)