export type WorkflowType = "pdf" | "contract_review";
export type ReviewStep = "upload" | "markdown" | "summary" | "decision";
export type DocumentOrigin = "upload" | "s3";

export interface UploadedPDF {
  filename: string;
  s3_uri: string;
  object_key: string;
  size_bytes: number;
  sha256: string;
  content_type: "application/pdf";
}

export interface PDFUploadResponse {
  files: UploadedPDF[];
}

export interface WorkflowStartResponse {
  workflow_id: string;
}

export interface WorkflowSummary {
  workflow_id: string;
  run_id: string;
  workflow_type: WorkflowType;
  execution_status: string;
  start_time: string;
  close_time: string | null;
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
}

export interface HealthResponse {
  status: "ready";
}

export interface PDFWorkflowStatus {
  workflow_id: string;
  execution_status: string;
  phase: string;
  result_available: boolean;
}

export interface PDFArtifact {
  output_s3_path: string;
  sha256: string;
  size_bytes: number;
  content_type: string;
}

export interface PDFWorkflowResult {
  workflow_id: string;
  execution_status: string;
  final_status: "completed" | "failed" | "cancelled" | "timed_out";
  result: PDFArtifact | null;
  error: string;
}

export interface Artifact {
  s3_path: string;
  sha256: string;
  size_bytes: number;
  content_type: string;
}

export interface DocumentAnalysis {
  summary: string;
  key_risks: string;
  chunks_processed: number;
  characters_processed: number;
  artifact: Artifact;
}

export interface DocumentOutcome {
  s3_path: string;
  status: "succeeded" | "failed";
  analysis: DocumentAnalysis | null;
  error: string;
}

export interface ContractReport {
  overall_risk_level: string;
  top_cross_contract_risks: string;
  recommended_actions: string;
}

export interface ContractDocumentProgress {
  s3_path: string;
  status: "succeeded" | "failed";
  error: string;
  chunks_processed: number | null;
  characters_processed: number | null;
  artifact_s3_path: string | null;
  summary: string;
  key_risks: string;
}

export interface ContractWorkflowStatus {
  workflow_id: string;
  execution_status: string;
  phase: string;
  current_revision: number;
  reviewer: string;
  completeness: string;
  documents: ContractDocumentProgress[];
  report_available: boolean;
  result_available: boolean;
}

export interface ContractReportQuery {
  workflow_id: string;
  phase: string;
  current_revision: number;
  reviewer: string;
  completeness: string;
  report: ContractReport | null;
  documents: DocumentOutcome[];
}

export interface ContractReviewResult {
  workflow_id: string;
  execution_status: string;
  final_status:
    | "approved"
    | "timed_out"
    | "revision_limit_reached"
    | "cancelled"
    | "failed";
  completeness: string;
  report: ContractReport | null;
  documents: DocumentOutcome[];
  reviewer: string;
  revision_count: number;
  error: string;
}

export interface ReviewActionResponse {
  status: "accepted";
  message: string;
}

export interface MarkdownArtifact {
  uri: string;
  filename: string;
  content: string;
}

export interface LLMSettings {
  model: string;
  base_url: string;
  request_timeout_seconds: number | null;
  api_key_configured: boolean;
  api_key_hint: string;
}

export interface OperationalSettings {
  s3_configured: boolean;
  s3_bucket: string;
  s3_endpoint_url: string;
  upload_max_files: number;
  upload_max_bytes: number;
  llm: LLMSettings;
}

export interface LLMConnectionTest {
  ok: boolean;
  message: string;
  model: string;
  base_url: string;
}

export interface PipelineDocument {
  filename: string;
  source_s3_uri: string;
  origin: DocumentOrigin;
  pdf_workflow_id: string;
  markdown_s3_uri: string;
  markdown_sha256: string;
  markdown_size_bytes: string;
  markdown_ready: string;
  error: string;
}

export interface LLMSettingsPayload {
  model?: string;
  base_url?: string;
  request_timeout_seconds?: number;
  api_key?: string;
}
