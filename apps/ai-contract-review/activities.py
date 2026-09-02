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
    BASE_URL,
    API_KEY,
    MODEL,
)

# activity 1 : extract pdf from S3

@activity.defn
async def extract_pdf(params: ExtractPDFInput) -> ExtractPDFOutput:
    activity.logger.info(f"Starting extraction : {params.s3_path}")

    activity.heartbeat(
        {
        "stage":"downloading",
        "s3_path": params.s3_path,
        "pages_done": 0,
        "chars_extracted": 0,
    }
    )
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

        activity.heartbeat(
            {
                "stage":"extracting",
                "s3_path": params.s3_path,
                "pages_done": end_page,
                "total_pages": total_pages,
                "batch":f"{start_page+1}-{end_page}",
                "chars_extracted": total_chars_num,
                "progress_pct": round((end_page / total_pages) * 100, 2),
            }
        )

    full_md = "\n\n".join(all_text_chunks)

    activity.heartbeat(
        {
            "stage":"done",
            "s3_path": params.s3_path,
            "pages_done": total_pages,
            "total_pages": total_pages,
            "chars_extracted": total_chars_num,
        }
    )

    return ExtractPDFOutput(
        s3_path=params.s3_path,
        markdown_text=full_md,
        page_count=total_pages,
    )



# activity 2 : call the llm via openrouter 

@activity.defn
async def call_llm(params: CallLLMInput) -> CallLLMOutput:
    activity.logger.info(f"Calling LLM ")
    activity.heartbeat(
        {
            "stage":"calling_llm",
            "prompt_chars": len(params.prompt),
        }
    )

    llm_client = OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
    )
    response = llm_client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": params.prompt}],
        max_tokens=8000,
    )

    content = response.choices[0].message.content
    activity.logger.info(f"LLM returned {len(content)} characters")

    return CallLLMOutput(content=content)