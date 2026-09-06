import type {
  ContractReportQuery,
  ContractReviewResult,
  ContractWorkflowStatus,
  PdfUploadResponse,
  PdfWorkflowResult,
  PdfWorkflowStatus,
  ReviewActionResponse,
  ReviewDecision,
  WorkflowListResponse,
  WorkflowStartResponse,
} from "../types/workflows"

const API_BASE = "/api"

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

function validationMessage(detail: unknown): string {
  if (!Array.isArray(detail)) return "Please check the submitted values."
  const messages = detail.flatMap((issue) => {
    if (typeof issue !== "object" || issue === null) return []
    const record = issue as Record<string, unknown>
    const location = Array.isArray(record.loc)
      ? record.loc.filter((part) => part !== "body").join(".")
      : ""
    const message =
      typeof record.msg === "string" ? record.msg : "Invalid value."
    return [location ? `${location}: ${message}` : message]
  })
  return messages.join(" ") || "Please check the submitted values."
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === "string") return body.detail
    if (Array.isArray(body.detail)) return validationMessage(body.detail)
  } catch {
    // The safe status-specific fallback below is used for non-JSON responses.
  }
  if (response.status === 404) return "The requested workflow was not found."
  if (response.status === 409)
    return "The workflow changed. Refresh and try again."
  if (response.status === 422) return "Please check the submitted values."
  if (response.status === 503)
    return "The workflow service is currently unavailable."
  return "The API returned an unexpected error. Please try again."
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: options.body instanceof FormData
        ? options.headers
        : { Accept: "application/json", ...options.headers },
    })
  } catch {
    throw new ApiError(0, "The interface could not connect to the document API.")
  }
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response))
  }
  return (await response.json()) as T
}

function jsonOptions(method: "POST", body: unknown): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
}

function workflowPath(workflowId: string): string {
  return encodeURIComponent(workflowId)
}

export const api = {
  listWorkflows(limit = 50): Promise<WorkflowListResponse> {
    return request(`/workflows?limit=${limit}`)
  },

  uploadPdfs(files: File[]): Promise<PdfUploadResponse> {
    const body = new FormData()
    files.forEach((file) => body.append("files", file))
    return request("/uploads/pdfs", { method: "POST", body })
  },

  startPdf(s3Path: string): Promise<WorkflowStartResponse> {
    return request("/process_pdf/start", jsonOptions("POST", { s3_path: s3Path }))
  },

  getPdfStatus(workflowId: string): Promise<PdfWorkflowStatus> {
    return request(`/process_pdf/${workflowPath(workflowId)}/status`)
  },

  getPdfResult(workflowId: string): Promise<PdfWorkflowResult> {
    return request(`/process_pdf/${workflowPath(workflowId)}/result`)
  },

  startContractReview(
    s3Paths: string[],
    maxRevisions: number,
  ): Promise<WorkflowStartResponse> {
    return request(
      "/contract-review/start",
      jsonOptions("POST", {
        s3_paths: s3Paths,
        max_revisions: maxRevisions,
      }),
    )
  },

  getContractStatus(workflowId: string): Promise<ContractWorkflowStatus> {
    return request(`/contract-review/${workflowPath(workflowId)}/status`)
  },

  getContractReport(workflowId: string): Promise<ContractReportQuery> {
    return request(`/contract-review/${workflowPath(workflowId)}/report`)
  },

  getContractResult(workflowId: string): Promise<ContractReviewResult> {
    return request(`/contract-review/${workflowPath(workflowId)}/result`)
  },

  assignReviewer(
    workflowId: string,
    name: string,
  ): Promise<ReviewActionResponse> {
    return request(
      `/contract-review/${workflowPath(workflowId)}/assign`,
      jsonOptions("POST", { name }),
    )
  },

  submitReview(
    workflowId: string,
    decision: ReviewDecision,
  ): Promise<ReviewActionResponse> {
    return request(
      `/contract-review/${workflowPath(workflowId)}/decision`,
      jsonOptions("POST", decision),
    )
  },

  markdownUrl(uri: string, download = false): string {
    const params = new URLSearchParams({ uri })
    if (download) params.set("download", "true")
    return `${API_BASE}/artifacts/markdown?${params}`
  },

  async getMarkdown(uri: string): Promise<string> {
    let response: Response
    try {
      response = await fetch(this.markdownUrl(uri), {
        headers: { Accept: "text/markdown" },
      })
    } catch {
      throw new ApiError(0, "The Markdown preview could not connect to the API.")
    }
    if (!response.ok) {
      throw new ApiError(response.status, await errorMessage(response))
    }
    return response.text()
  },
}
