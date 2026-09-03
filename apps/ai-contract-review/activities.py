import os
import hashlib
import json
import math
import tempfile
from pathlib import Path
from dataclasses import asdict, dataclass

import fitz                 
import json_repair
import pymupdf4llm
from openai import OpenAI
from temporalio import activity
from temporalio.exceptions import ApplicationError

from helpers import (
    AnalyzeContractInput,
    ArtifactReference,
    ContractReport,
    DocumentAnalysis,
    ExtractContractArtifactOutput,
    ExtractPDFInput,
    ReviseReportInput,
    SynthesizeReportInput,
    CallLLMInput,
    CallLLMOutput,
    get_s3_client,
    derive_contract_artifact_key,
    parse_s3_path,
    BASE_URL,
    API_KEY,
    MODEL,
)
from prompts import (
    _CHUNK_ANALYSIS_PROMPT,
    _DOCUMENT_AGGREGATION_PROMPT,
    _REVISION_PROMPT,
    _SYNTHESIS_PROMPT,
)


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

    temp_root = Path(os.environ["TEMP_DIR"])
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


@activity.defn
def synthesize_contract_report(params: SynthesizeReportInput) -> ContractReport:
    successful = [
        document
        for document in params.documents
        if document.status == "succeeded" and document.analysis is not None
    ]
    if not successful:
        raise ApplicationError(
            "No successful documents are available for synthesis",
            type="NoDocumentsToSynthesize",
            non_retryable=True,
        )

    summaries = "\n\n".join(
        f"**Contract {index + 1}** (`{document.s3_path}`):\n"
        f"Summary: {document.analysis.summary}\n"
        f"Risks: {document.analysis.key_risks}"
        for index, document in enumerate(successful)
    )
    prompt = _SYNTHESIS_PROMPT.format(
        n=len(successful),
        summaries=(
            f"Analysis completeness: {params.completeness}.\n"
            f"{summaries}"
        ),
    )
    activity.heartbeat(
        {"stage": "synthesizing", "documents": len(successful)}
    )
    report = parse_contract_report(_call_llm_content(prompt))
    activity.logger.info("Synthesized %s successful documents", len(successful))
    return report


@activity.defn
def revise_contract_report(params: ReviseReportInput) -> ContractReport:
    feedback = params.feedback.strip()
    if not feedback:
        raise ApplicationError(
            "Revision feedback is required",
            type="InvalidRevisionFeedback",
            non_retryable=True,
        )

    prompt = _REVISION_PROMPT.format(
        report=json.dumps(asdict(params.report), ensure_ascii=False, indent=2),
        feedback=feedback,
    )
    activity.heartbeat({"stage": "revising", "feedback_chars": len(feedback)})
    report = parse_contract_report(_call_llm_content(prompt))
    activity.logger.info("Revised contract report")
    return report

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
