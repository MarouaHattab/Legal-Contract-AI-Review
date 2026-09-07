import type { LLMSettingsPayload } from "../api/types";

function normalizeHttpUrl(value: string, label: string): string {
  const normalized = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid HTTP URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must be a valid HTTP URL.`);
  }
  return normalized.replace(/\/+$/, "");
}

export function normalizeConnectionSettings(
  value: string,
  pollIntervalSeconds: number,
): { apiUrl: string; pollIntervalSeconds: number } {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Enter a FastAPI base URL.");
  }
  const apiUrl = normalized.startsWith("/")
    ? normalized.replace(/\/+$/, "") || "/"
    : normalizeHttpUrl(normalized, "FastAPI base URL");
  return {
    apiUrl,
    pollIntervalSeconds: Math.min(
      60,
      Math.max(2, Math.round(pollIntervalSeconds || 3)),
    ),
  };
}

export function normalizeModelSettings(input: {
  model: string;
  baseUrl: string;
  timeoutSeconds: number;
  apiKey: string;
}): LLMSettingsPayload {
  const model = input.model.trim();
  if (!model) {
    throw new Error("Enter the provider's exact model ID.");
  }
  if (
    !Number.isInteger(input.timeoutSeconds) ||
    input.timeoutSeconds < 1 ||
    input.timeoutSeconds > 600
  ) {
    throw new Error("Request timeout must be between 1 and 600 seconds.");
  }
  const apiKey = input.apiKey.trim();
  return {
    model,
    base_url: normalizeHttpUrl(input.baseUrl, "Model base URL"),
    request_timeout_seconds: input.timeoutSeconds,
    ...(apiKey ? { api_key: apiKey } : {}),
  };
}
