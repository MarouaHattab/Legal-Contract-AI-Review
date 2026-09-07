export type APIErrorKind =
  | "not_found"
  | "conflict"
  | "validation"
  | "unavailable"
  | "timeout"
  | "connection"
  | "unexpected";

export class APIError extends Error {
  readonly kind: APIErrorKind;
  readonly statusCode: number | null;

  constructor(
    message: string,
    kind: APIErrorKind,
    statusCode: number | null = null,
  ) {
    super(message);
    this.name = "APIError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

function validationMessage(detail: unknown): string {
  if (!Array.isArray(detail)) {
    return "Please check the submitted values.";
  }
  const messages = detail
    .filter((issue): issue is Record<string, unknown> => Boolean(issue) && typeof issue === "object")
    .map((issue) => {
      const location = Array.isArray(issue.loc) ? issue.loc : [];
      const field = location
        .filter((item) => item !== "body")
        .map(String)
        .join(".");
      const message = String(issue.msg ?? "Invalid value.");
      return field ? `${field}: ${message}` : message;
    });
  return messages.join(" ") || "Please check the submitted values.";
}

export function messageFromDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return validationMessage(detail);
  }
  return "";
}

export function errorFromStatus(status: number, detail: string): APIError {
  if (status === 404) {
    return new APIError(
      detail || "The requested workflow was not found.",
      "not_found",
      status,
    );
  }
  if (status === 409) {
    return new APIError(
      detail || "The workflow state changed. Try again.",
      "conflict",
      status,
    );
  }
  if (status === 422) {
    return new APIError(
      detail || "Please check the submitted values.",
      "validation",
      status,
    );
  }
  if (status === 503) {
    return new APIError(
      detail || "The workflow service is currently unavailable.",
      "unavailable",
      status,
    );
  }
  return new APIError(
    "The API returned an unexpected error. Please try again.",
    "unexpected",
    status,
  );
}
