const MAX_CONTRACT_DOCUMENTS = 20;

export function validateS3PdfUri(value: string): string {
  const normalized = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Use a valid s3://bucket/key.pdf URI.");
  }
  const key = parsed.pathname.replace(/^\/+/, "");
  if (
    parsed.protocol !== "s3:" ||
    !parsed.hostname ||
    !key ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !key.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Use a valid s3://bucket/key.pdf URI.");
  }
  return normalized;
}

export function parseContractPaths(value: string): string[] {
  const raw = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!raw.length) {
    throw new Error("Enter at least one S3 PDF URI.");
  }
  if (raw.length > MAX_CONTRACT_DOCUMENTS) {
    throw new Error(`Enter no more than ${MAX_CONTRACT_DOCUMENTS} documents.`);
  }
  const paths = raw.map(validateS3PdfUri);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Duplicate contract documents are not allowed.");
  }
  return paths;
}

export function sourceFilename(uri: string, fallback = "document.pdf"): string {
  try {
    const name = new URL(uri).pathname.split("/").pop();
    return name || fallback;
  } catch {
    return uri.split("/").pop() || fallback;
  }
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 ** 2) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  }
  return `${(sizeBytes / 1024 ** 2).toFixed(1)} MiB`;
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
