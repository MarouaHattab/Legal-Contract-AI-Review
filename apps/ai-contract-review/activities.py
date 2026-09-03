import os
import math
import tempfile
from pathlib import Path
from dataclasses import dataclass

import boto3
import fitz                 
import json_repair
import pymupdf4llm
from dotenv import load_dotenv
from openai import OpenAI
from temporalio import activity
from temporalio.exceptions import ApplicationError

from helpers import (
    AnalyzeContractInput,
    ContractReport,
    DocumentAnalysis,
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
from prompts import _CHUNK_ANALYSIS_PROMPT, _DOCUMENT_AGGREGATION_PROMPT


MAX_CHUNK_CHARACTERS = 12_000
AGGREGATION_BATCH_SIZE = 8


@dataclass(frozen=True)
class TextChunk:
    index: int
    start: int
    end: int
    text: str


@dataclass(frozen=True)
class DocumentFinding:
    summary: str
    key_risks: str


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARACTERS) -> list[TextChunk]:
    """Split text into deterministic, non-overlapping character ranges."""
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")

    return [
        TextChunk(
            index=index,
            start=start,
            end=min(start + max_chars, len(text)),
            text=text[start : start + max_chars],
        )
        for index, start in enumerate(range(0, len(text), max_chars))
    ]


def _parse_json_object(content: str, required_fields: tuple[str, ...]) -> dict:
    try:
        parsed = json_repair.loads(content)
    except Exception as exc:
        raise ApplicationError(
            "LLM returned malformed JSON",
            type="MalformedLLMResponse",
            non_retryable=True,
        ) from exc

    if not isinstance(parsed, dict) or set(parsed) != set(required_fields):
        raise ApplicationError(
            "LLM response did not match the required schema",
            type="MalformedLLMResponse",
            non_retryable=True,
        )

    for field in required_fields:
        if not isinstance(parsed[field], str) or not parsed[field].strip():
            raise ApplicationError(
                f"LLM response field {field!r} must be a non-empty string",
                type="MalformedLLMResponse",
                non_retryable=True,
            )
    return parsed


def parse_document_finding(content: str) -> DocumentFinding:
    parsed = _parse_json_object(content, ("summary", "key_risks"))
    return DocumentFinding(
        summary=parsed["summary"].strip(),
        key_risks=parsed["key_risks"].strip(),
    )


def parse_contract_report(content: str) -> ContractReport:
    parsed = _parse_json_object(
        content,
        (
            "overall_risk_level",
            "top_cross_contract_risks",
            "recommended_actions",
        ),
    )
    return ContractReport(
        overall_risk_level=parsed["overall_risk_level"].strip(),
        top_cross_contract_risks=parsed["top_cross_contract_risks"].strip(),
        recommended_actions=parsed["recommended_actions"].strip(),
    )


def _call_llm_content(prompt: str) -> str:
    llm_client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    response = llm_client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=8000,
    )
    content = response.choices[0].message.content
    if not content:
        raise ApplicationError(
            "LLM returned an empty response",
            type="MalformedLLMResponse",
            non_retryable=True,
        )
    return content


def _aggregate_document_findings(
    source_s3_path: str,
    findings: list[DocumentFinding],
) -> DocumentFinding:
    current = findings
    while len(current) > 1:
        reduced: list[DocumentFinding] = []
        for start in range(0, len(current), AGGREGATION_BATCH_SIZE):
            batch = current[start : start + AGGREGATION_BATCH_SIZE]
            if len(batch) == 1:
                reduced.append(batch[0])
                continue

            analyses = "\n\n".join(
                f"Analysis {index + 1}:\nSummary: {item.summary}\nRisks: {item.key_risks}"
                for index, item in enumerate(batch)
            )
            prompt = _DOCUMENT_AGGREGATION_PROMPT.format(
                source=source_s3_path,
                analyses=analyses,
            )
            reduced.append(parse_document_finding(_call_llm_content(prompt)))
        current = reduced
    return current[0]


@activity.defn
def analyze_contract_artifact(params: AnalyzeContractInput) -> DocumentAnalysis:
    """Analyze every character of a durable extracted-contract artifact."""
    bucket, key = parse_s3_path(params.artifact.s3_path)
    response = get_s3_client().get_object(Bucket=bucket, Key=key)
    text = response["Body"].read().decode("utf-8")
    chunks = chunk_text(text)
    if not chunks:
        raise ApplicationError(
            "Extracted contract is empty",
            type="EmptyContract",
            non_retryable=True,
        )

    findings: list[DocumentFinding] = []
    for chunk in chunks:
        activity.heartbeat(
            {
                "stage": "analyzing",
                "source": params.source_s3_path,
                "chunk": chunk.index + 1,
                "total_chunks": len(chunks),
                "characters_processed": chunk.end,
            }
        )
        prompt = _CHUNK_ANALYSIS_PROMPT.format(
            source=params.source_s3_path,
            start=chunk.start,
            end=chunk.end,
            text=chunk.text,
        )
        findings.append(parse_document_finding(_call_llm_content(prompt)))

    aggregate = _aggregate_document_findings(params.source_s3_path, findings)
    activity.logger.info(
        "Analyzed %s characters across %s chunks for %s",
        len(text),
        len(chunks),
        params.source_s3_path,
    )
    return DocumentAnalysis(
        summary=aggregate.summary,
        key_risks=aggregate.key_risks,
        chunks_processed=len(chunks),
        characters_processed=len(text),
        artifact=params.artifact,
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

    content = _call_llm_content(params.prompt)
    activity.logger.info(f"LLM returned {len(content)} characters")

    return CallLLMOutput(content=content)
