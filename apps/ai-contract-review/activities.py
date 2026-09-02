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


load_dotenv()

#data class


@dataclass
class ExtractPDFInput:
    s3_path: str
    batch_size: int =2

@dataclass
class ExtractPDFOutput:
    s3_path: str
    markdown_text: str
    page_count: int

@dataclass
class CallLLMInput:
    prompt: str

@dataclass
class CallLLMOutput:
    content: str


# activity 1 : extract pdf from S3

@activity.defn
async def extract_pdf(params: ExtractPDFInput) -> ExtractPDFOutput:
    pass

# activity 2 : call the llm via openrouter 

@activity.defn
async def call_llm(params: CallLLMInput) -> CallLLMOutput:
    pass