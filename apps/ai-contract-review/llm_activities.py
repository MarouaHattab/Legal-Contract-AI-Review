import json
from dataclasses import asdict, dataclass

import json_repair
from helpers import (
    AnalyzeContractInput,
    ContractReport,
    DocumentAnalysis,
    ReviseReportInput,
    SynthesizeReportInput,
    get_s3_client,
    parse_s3_path,
)
from openai import OpenAI
from prompts import (
    _CHUNK_ANALYSIS_PROMPT,
    _DOCUMENT_AGGREGATION_PROMPT,
    _REVISION_PROMPT,
    _SYNTHESIS_PROMPT,
)
from settings import get_contract_settings
from temporalio import activity
from temporalio.exceptions import ApplicationError

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
    settings = get_contract_settings()
    llm_client = OpenAI(
        api_key=settings.openrouter_api_key.get_secret_value(),
        base_url=settings.llm_base_url,
    )
    response = llm_client.chat.completions.create(
        model=settings.llm_model,
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
        summaries=(f"Analysis completeness: {params.completeness}.\n{summaries}"),
    )
    activity.heartbeat({"stage": "synthesizing", "documents": len(successful)})
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
