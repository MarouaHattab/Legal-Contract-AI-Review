async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function submissionFingerprint(
  workflowType: string,
  payload: unknown,
): Promise<string> {
  return sha256Hex(
    JSON.stringify({ workflow_type: workflowType, payload }),
  );
}

export async function fileFingerprint(
  file: File,
): Promise<{ filename: string; sha256: string }> {
  const digest = await sha256Hex(await file.arrayBuffer());
  return { filename: file.name, sha256: digest };
}
