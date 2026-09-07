import {
  APIError,
  errorFromStatus,
  messageFromDetail,
} from "./errors";
import type {
  ContractReportQuery,
  ContractReviewResult,
  ContractWorkflowStatus,
  HealthResponse,
  LLMConnectionTest,
  LLMSettingsPayload,
  MarkdownArtifact,
  OperationalSettings,
  PDFUploadResponse,
  PDFWorkflowResult,
  PDFWorkflowStatus,
  ReviewActionResponse,
  WorkflowListResponse,
  WorkflowStartResponse,
} from "./types";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

let apiBaseUrl = DEFAULT_BASE;

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_BASE;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/$/, "") || DEFAULT_BASE;
}

function workflowPath(workflowId: string): string {
  return encodeURIComponent(workflowId);
}

function filenameFromDisposition(header: string, uri: string): string {
  const match = /filename="([^"]+)"/.exec(header);
  if (match?.[1]) {
    return match[1];
  }
  try {
    const path = new URL(uri).pathname;
    const name = path.split("/").pop();
    return name || "artifact.md";
  } catch {
    const name = uri.split("/").pop();
    return name || "artifact.md";
  }
}

async function parseError(response: Response): Promise<APIError> {
  let detail = "";
  try {
    detail = messageFromDetail(await response.json());
  } catch {
    detail = "";
  }
  return errorFromStatus(response.status, detail);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number; accept?: string } = {},
): Promise<T> {
  const attempts = options.retries ?? 1;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (!headers.has("Accept")) {
        headers.set("Accept", options.accept ?? "application/json");
      }
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
      if (!response.ok) {
        throw await parseError(response);
      }
      if (options.accept === "text/markdown") {
        return (await response.text()) as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof APIError) {
        throw error;
      }
      if (attempt + 1 < attempts) {
        continue;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new APIError(
          "The API request timed out. The workflow may still be running.",
          "timeout",
        );
      }
      throw new APIError(
        "The interface could not connect to the document API.",
        "connection",
      );
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError instanceof APIError
    ? lastError
    : new APIError("The API request failed.", "unexpected");
}

export const api = {
  async readiness(baseUrl = apiBaseUrl): Promise<HealthResponse> {
    const previous = apiBaseUrl;
    setApiBaseUrl(baseUrl);
    try {
      return await request<HealthResponse>("/health/ready", {}, { retries: 2 });
    } finally {
      setApiBaseUrl(previous);
    }
  },

  listWorkflows(limit = 50): Promise<WorkflowListResponse> {
    return request<WorkflowListResponse>(
      `/workflows?limit=${limit}`,
      {},
      { retries: 2 },
    );
  },

  async uploadPdfs(files: File[]): Promise<PDFUploadResponse> {
    const body = new FormData();
    for (const file of files) {
      body.append("files", file, file.name);
    }
    return request<PDFUploadResponse>(
      "/uploads/pdfs",
      { method: "POST", body },
      { timeoutMs: 300_000 },
    );
  },

  startPdf(s3Path: string): Promise<WorkflowStartResponse> {
    return request<WorkflowStartResponse>("/process_pdf/start", {
      method: "POST",
      body: JSON.stringify({ s3_path: s3Path }),
    });
  },

  getPdfStatus(workflowId: string): Promise<PDFWorkflowStatus> {
    return request<PDFWorkflowStatus>(
      `/process_pdf/${workflowPath(workflowId)}/status`,
      {},
      { retries: 2 },
    );
  },

  getPdfResult(workflowId: string): Promise<PDFWorkflowResult> {
    return request<PDFWorkflowResult>(
      `/process_pdf/${workflowPath(workflowId)}/result`,
      {},
      { retries: 2 },
    );
  },

  startContractReview(payload: {
    s3_paths: string[];
    max_revisions: number;
    markdown_s3_paths?: string[];
    markdown_sha256s?: string[];
    markdown_size_bytes?: number[];
  }): Promise<WorkflowStartResponse> {
    return request<WorkflowStartResponse>("/contract-review/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getContractStatus(workflowId: string): Promise<ContractWorkflowStatus> {
    return request<ContractWorkflowStatus>(
      `/contract-review/${workflowPath(workflowId)}/status`,
      {},
      { retries: 2 },
    );
  },

  getContractReport(workflowId: string): Promise<ContractReportQuery> {
    return request<ContractReportQuery>(
      `/contract-review/${workflowPath(workflowId)}/report`,
      {},
      { retries: 2 },
    );
  },

  getContractResult(workflowId: string): Promise<ContractReviewResult> {
    return request<ContractReviewResult>(
      `/contract-review/${workflowPath(workflowId)}/result`,
      {},
      { retries: 2 },
    );
  },

  assignReviewer(
    workflowId: string,
    name: string,
  ): Promise<ReviewActionResponse> {
    return request<ReviewActionResponse>(
      `/contract-review/${workflowPath(workflowId)}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
  },

  submitReview(
    workflowId: string,
    payload: {
      decision: "approve" | "revise";
      expected_revision: number;
      feedback?: string;
    },
  ): Promise<ReviewActionResponse> {
    return request<ReviewActionResponse>(
      `/contract-review/${workflowPath(workflowId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: payload.decision,
          expected_revision: payload.expected_revision,
          feedback: payload.feedback ?? "",
        }),
      },
    );
  },

  getSettings(): Promise<OperationalSettings> {
    return request<OperationalSettings>("/settings", {}, { retries: 2 });
  },

  updateLlmSettings(
    payload: LLMSettingsPayload,
  ): Promise<OperationalSettings> {
    return request<OperationalSettings>("/settings/llm", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  testLlmSettings(payload: LLMSettingsPayload): Promise<LLMConnectionTest> {
    return request<LLMConnectionTest>("/settings/llm/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getMarkdownArtifact(uri: string): Promise<MarkdownArtifact> {
    const attempts = 2;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(
          `${apiBaseUrl}/artifacts/markdown?uri=${encodeURIComponent(uri)}`,
          {
            headers: { Accept: "text/markdown" },
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw await parseError(response);
        }
        return {
          uri,
          filename: filenameFromDisposition(
            response.headers.get("content-disposition") ?? "",
            uri,
          ),
          content: await response.text(),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof APIError || attempt + 1 >= attempts) {
          if (error instanceof APIError) {
            throw error;
          }
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new APIError("The Markdown request timed out.", "timeout");
          }
          throw new APIError(
            "The interface could not connect to the document API.",
            "connection",
          );
        }
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError instanceof APIError
      ? lastError
      : new APIError("The Markdown request failed.", "unexpected");
  },
};
