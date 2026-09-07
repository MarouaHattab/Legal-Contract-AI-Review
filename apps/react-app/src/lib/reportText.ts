import { riskLabel, riskTone } from "./risk";

const LIST_PREFIX =
  /^(?:[-*•]|\d{1,2}[\.)]|\(\d{1,2}\)|risk\s+\d+\s*[:.)-])\s+/i;

export function splitOverallRisk(text: string): {
  rating: string;
  detail: string;
} {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const match = trimmed.match(
    /^(critical|severe|high|medium|moderate|low|minimal)\b\s*[-–—:.]+\s*([\s\S]+)$/i,
  );
  if (match) {
    return {
      rating: titleCase(match[1]),
      detail: match[2].trim(),
    };
  }
  const tone = riskTone(trimmed);
  return {
    rating: titleCase(riskLabel(tone)),
    detail: trimmed,
  };
}

export function splitReportItems(text: string): string[] {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return [];
  }

  const riskBlocks = splitOnPattern(
    trimmed,
    /(?=(?:^|\n)\s*risk\s+\d+\s*[:.)-]\s*)/gim,
  );
  if (riskBlocks.length > 1) {
    return riskBlocks;
  }

  const inlineRisks = trimmed
    .split(/(?=\bRisk\s+\d+\s*[:.)-]\s*)/i)
    .map(stripListPrefix)
    .map(flattenWhitespace)
    .filter((item) => item.length > 8);
  if (inlineRisks.length > 1) {
    return inlineRisks;
  }

  const numbered = splitOnPattern(
    trimmed,
    /(?=^\s*(?:\d{1,2}[\.)]|\(\d{1,2}\))\s+)/gm,
  );
  if (numbered.length > 1) {
    return numbered;
  }

  const bullets = splitOnPattern(trimmed, /(?=^\s*[-*•]\s+)/gm);
  if (bullets.length > 1) {
    return bullets;
  }

  const inlineNumbered = trimmed
    .split(/(?:^|\s+)(?=\d{1,2}[\.)]\s+[A-Z“"])/)
    .map(stripListPrefix)
    .map(flattenWhitespace)
    .filter((item) => item.length > 8);
  if (inlineNumbered.length > 1) {
    return inlineNumbered;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1 && lines.filter((line) => LIST_PREFIX.test(line)).length > 1) {
    return lines.map(stripListPrefix).filter(Boolean);
  }

  if (trimmed.length > 180) {
    const sentences = trimmed
      .split(/(?<=[.!?])\s+(?=[A-Z“"])/)
      .map((part) => part.trim())
      .filter((part) => part.length > 28);
    if (sentences.length >= 3) {
      return sentences;
    }
  }

  return [flattenWhitespace(trimmed)];
}

export function itemHeading(item: string): { title?: string; body: string } {
  const clean = flattenWhitespace(item);
  const titled = clean.match(
    /^(risk\s+\d+|recommendation\s+\d+|[A-Z][^:]{4,60}?)\s*[:—–]\s+(.+)$/i,
  );
  if (titled) {
    const title = titled[1].trim();
    if (title.split(/\s+/).length <= 10) {
      return { title: polishTitle(title), body: titled[2].trim() };
    }
  }

  const dashed = clean.match(/^(.{8,64}?)\s+[-–—]\s+(.+)$/);
  if (dashed) {
    const title = dashed[1].trim();
    if (title.split(/\s+/).length <= 8 && !/[.!?]$/.test(title)) {
      return { title: polishTitle(title), body: dashed[2].trim() };
    }
  }

  return { body: clean };
}

function splitOnPattern(text: string, pattern: RegExp): string[] {
  return text
    .split(pattern)
    .map(stripListPrefix)
    .map(flattenWhitespace)
    .filter((item) => item.length > 2);
}

function stripListPrefix(value: string): string {
  return value.trim().replace(LIST_PREFIX, "").trim();
}

function flattenWhitespace(value: string): string {
  return value.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function polishTitle(value: string): string {
  if (/^risk\s+\d+$/i.test(value)) {
    return value.replace(/risk/i, "Risk");
  }
  if (/^recommendation\s+\d+$/i.test(value)) {
    return value.replace(/recommendation/i, "Recommendation");
  }
  return value;
}

function titleCase(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
