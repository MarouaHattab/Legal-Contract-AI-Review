import os 
import sys
import tempfile
import logging
from pathlib import Path
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
