from dataclasses import dataclass
from dotenv import load_dotenv
import boto3
import os

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

@dataclass
class DownloadInput:
    s3_path: str

@dataclass
class DownloadOutput:
    local_path: str

@dataclass
class ExtractInput:
    local_path: str

@dataclass
class ExtractOutput:
    markdown_text: str

@dataclass
class UploadInput:
    markdown_text: str
    original_s3_path: str

@dataclass
class UploadOutput:
    output_s3_path: str   # e.g. "s3://bucket/reports/annual-report.md"


# ── S3 helper ────────────────────────────────────────────────────────────────

def get_s3_client():
    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        endpoint_url=AWS_S3_ENDPOINT_URL,
    )

def parse_s3_path(s3_path: str):
    s3_path_no_scheme = s3_path.replace("s3://", "")
    bucket, _, key =  s3_path_no_scheme.partition("/")
    return bucket, key