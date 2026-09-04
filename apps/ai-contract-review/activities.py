"""Compatibility exports for the Phase 1 Activity module path."""

from document_activities import extract_contract_artifact
from llm_activities import (
    DocumentFinding,
    TextChunk,
    analyze_contract_artifact,
    chunk_text,
    parse_contract_report,
    parse_document_finding,
    revise_contract_report,
    synthesize_contract_report,
)

__all__ = [
    "DocumentFinding",
    "TextChunk",
    "analyze_contract_artifact",
    "chunk_text",
    "extract_contract_artifact",
    "parse_contract_report",
    "parse_document_finding",
    "revise_contract_report",
    "synthesize_contract_report",
]
