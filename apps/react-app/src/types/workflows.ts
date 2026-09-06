export type WorkflowType = "pdf" | "contract_review"

export type WorkflowSummary = {
  workflow_id: string
  run_id: string
  workflow_type: WorkflowType
  execution_status: string
  start_time: string
  close_time: string | null
}

export type WorkflowListResponse = {
  workflows: WorkflowSummary[]
}

export type WorkflowStartResponse = {
  workflow_id: string
}

export type UploadedPdf = {
  filename: string
  s3_uri: string
  object_key: string
  size_bytes: number
  sha256: string
  content_type: "application/pdf"
}

export type PdfUploadResponse = {
  files: UploadedPdf[]
}

export type PdfWorkflowStatus = {
  workflow_id: string
  execution_status: string
  phase: string
  result_available: boolean
}

export type PdfArtifact = {
  output_s3_path: string
  sha256: string
  size_bytes: number
  content_type: string
}

export type PdfWorkflowResult = {
  workflow_id: string
  execution_status: string
  final_status: "completed" | "failed" | "cancelled" | "timed_out"
  result: PdfArtifact | null
  error: string
}

export type Artifact = {
  s3_path: string
  sha256: string
  size_bytes: number
  content_type: string
}

export type DocumentAnalysis = {
  summary: string
  key_risks: string
  chunks_processed: number
  characters_processed: number
  artifact: Artifact
}

export type DocumentOutcome = {
  s3_path: string
  status: "succeeded" | "failed"
  analysis: DocumentAnalysis | null
  error: string
}

export type ContractReport = {
  overall_risk_level: string
  top_cross_contract_risks: string
  recommended_actions: string
}

export type ContractDocumentProgress = {
  s3_path: string
  status: "succeeded" | "failed"
  error: string
  chunks_processed: number | null
  characters_processed: number | null
  artifact_s3_path: string | null
}

export type ContractWorkflowStatus = {
  workflow_id: string
  execution_status: string
  phase: string
  current_revision: number
  reviewer: string
  completeness: string
  documents: ContractDocumentProgress[]
  report_available: boolean
  result_available: boolean
}

export type ContractReportQuery = {
  workflow_id: string
  phase: string
  current_revision: number
  reviewer: string
  completeness: string
  report: ContractReport | null
  documents: DocumentOutcome[]
}

export type ContractFinalStatus =
  | "approved"
  | "timed_out"
  | "revision_limit_reached"
  | "cancelled"
  | "failed"

export type ContractReviewResult = {
  workflow_id: string
  execution_status: string
  final_status: ContractFinalStatus
  completeness: string
  report: ContractReport | null
  documents: DocumentOutcome[]
  reviewer: string
  revision_count: number
  error: string
}

export type ReviewDecision = {
  decision: "approve" | "revise"
  feedback: string
  expected_revision: number
}

export type ReviewActionResponse = {
  status: "accepted"
  message: string
}

export type WorkflowStatus = PdfWorkflowStatus | ContractWorkflowStatus
