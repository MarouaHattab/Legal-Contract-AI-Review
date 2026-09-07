export type RiskTone = "low" | "medium" | "high" | "unknown";

export function riskTone(text: string): RiskTone {
  const value = text.toLowerCase();
  const explicit = value.match(
    /\b(?:overall\s+)?risk(?:\s+level)?(?:\s+is|\s*:)?\s+(critical|severe|high|medium|moderate|low|minimal)\b/,
  );
  const word =
    explicit?.[1] ??
    value.match(/\b(critical|severe|high|medium|moderate|low|minimal)\b/)?.[1];
  if (word === "critical" || word === "severe" || word === "high") {
    return "high";
  }
  if (word === "medium" || word === "moderate") {
    return "medium";
  }
  if (word === "low" || word === "minimal") {
    return "low";
  }
  return "unknown";
}

export function riskLabel(tone: RiskTone): string {
  if (tone === "unknown") {
    return "Reported";
  }
  return tone;
}
