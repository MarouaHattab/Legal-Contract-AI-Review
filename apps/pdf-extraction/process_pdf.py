"""
Phase 1 : Plain Python PDF-to-Markdown pipeline.
Usage:
    $ python process_pdf.py s3://my-pdfs-bucket/reports/annual_report.pdf

"""

import os 
import sys
import tempfile
import logging
from pathlib import Path

from altair import Key
import boto3
import pymupdf4llm
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO,format='%(asctime)s - %(levelname)s - %(message)s')
log=logging.getLogger(__name__)
load_dotenv() # Load environment variables from .env file

AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.environ.get("AWS_REGION")
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL")
S3_BUCKET = os.environ.get("S3_BUCKET")
TEMP_DIR = os.environ.get("TEMP_DIR")
os.makedirs(TEMP_DIR, exist_ok=True)  # Ensure TEMP_DIR exists
# S3 helper 

def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
        endpoint_url=AWS_S3_ENDPOINT_URL
    )

def parse_s3_path(s3_path: str):
    
    s3_path_no_scheme = s3_path.replace("s3://", "")
    bucket, _, key = s3_path_no_scheme.partition("/")  # Split into bucket and key
    #temporal-dev/folder/file.pdf -> bucket: temporal-dev,_ : / , key: folder/file.pdf, 
    return bucket, key

# step 1: Download the PDF from S3
def download_pdf_from_s3(s3_path: str) -> str:
    bucket, key = parse_s3_path(s3_path)
    filename=Path(key).name

    local_path = str(Path(TEMP_DIR) / filename)
    log.info(f"Downloading s3://{bucket}/{key} to {local_path}")
    s3_client = get_s3_client()
    s3_client.download_file(
        bucket
        , key
        , local_path
    )
    log.info(f"Downloaded {local_path}")
    return local_path

# step 2: Exttract to Markdown

def extract_pdf_to_markdown(local_pdf_path: str) -> str:
    log.info(f"Extracting text from {local_pdf_path}")
    markdown_text = pymupdf4llm.to_markdown(local_pdf_path)
    log.info(f"Extraction complete, length of text: {len(markdown_text)} characters")
    return markdown_text

# step 3: Upload the Markdown to S3 
def upload_markdown(markdown_text:str,orginal_s3_path:str)->str:
    bucket, key = parse_s3_path(orginal_s3_path)
    md_key =Key.replace(".pdf", ".md")
    log.info(f"Uploading markdown to s3://{bucket}/{md_key}")
    s3_client = get_s3_client()
    s3_client.put_object(
        Bucket=bucket,
        Key=md_key,
        Body=markdown_text.encode("utf-8"),
        ContentType="text/markdown"
    )

    output_path = f"s3://{bucket}/{md_key}"
    log.info(f"Uploaded markdown to {output_path}")
    return output_path


# main pipeline function


def process_pdf(s3_input_path: str) -> str:
    log.info(f"Starting PDF processing for {s3_input_path}")
    local_pdf= download_pdf_from_s3(s3_input_path)
    markdown= extract_pdf_to_markdown(local_pdf)
    output_s3 = upload_markdown(markdown, s3_input_path)
    #clean up temp file 
    os.remove(local_pdf)
    log.info(f"Pipeline complete. Markdown uploaded to {output_s3}")
    return output_s3

if __name__ == "__main__":
    output_s3 = process_pdf(
        sys.argv[1]
        )
    log.info(f"Pipeline finished. Result: {output_s3}")