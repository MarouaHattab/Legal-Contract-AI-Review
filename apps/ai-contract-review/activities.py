import os
import math
import tempfile
from pathlib import Path
from dataclasses import dataclass

import boto3
import fitz                 
import pymupdf4llm
from dotenv import load_dotenv
from openai import OpenAI
from temporalio import activity

from .helpers import (
    ExtractPDFInput,
    ExtractPDFOutput,
    CallLLMInput,
    CallLLMOutput,
    get_s3_client,
    parse_s3_path,
)

# activity 1 : extract pdf from S3

@activity.defn
async def extract_pdf(params: ExtractPDFInput) -> ExtractPDFOutput:
    activity.logger.info(f"Starting extraction : {params.s3_path}")
    s3_client = get_s3_client()
    bucket, key = parse_s3_path(params.s3_path)
    filename = Path(key).name
    TEMP_DIR = Path(os.environ["TEMP_DIR"])
    local_path =str(Path(TEMP_DIR) / filename)

    s3_client.download_file(bucket, key, local_path)

    doc = fitz.open(local_path)
    total_pages = doc.page_count
    activity.logger.info(f"Downloaded {total_pages} pages from {params.s3_path}")
    all_text_chunks = []
    total_chars_num = 0

    num_batches = math.ceil(total_pages / params.batch_size)

    for batch_idx in range(num_batches):
        start_page = batch_idx * params.batch_size
        end_page = min(start_page + params.batch_size, total_pages)
        batch_md= pymupdf4llm.to_markdown(
            local_path,
            pages = list(range(start_page, end_page)),
        )
        all_text_chunks.append(batch_md)
        total_chars_num += len(batch_md)
    full_md = "\n\n".join(all_text_chunks)
    return ExtractPDFOutput(
        s3_path=params.s3_path,
        markdown_text=full_md,
        page_count=total_pages,
    )



# activity 2 : call the llm via openrouter 

@activity.defn
async def call_llm(params: CallLLMInput) -> CallLLMOutput:
    pass