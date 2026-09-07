import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";
import type { MarkdownArtifact } from "../api/types";
import { downloadText, formatBytes } from "../lib/s3";
import { ErrorBanner } from "./ErrorBanner";

export function MarkdownPreview({
  uri,
  sizeBytes,
  sha256,
}: {
  uri: string;
  sizeBytes?: number;
  sha256?: string;
}) {
  const [tab, setTab] = useState<"preview" | "raw">("preview");
  const [artifact, setArtifact] = useState<MarkdownArtifact | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getMarkdownArtifact(uri)
      .then((value) => {
        if (!cancelled) {
          setArtifact(value);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  async function copyMarkdown() {
    if (!artifact) {
      return;
    }
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(new Error("The browser blocked copying this Markdown."));
    }
  }

  return (
    <div className="md-shell">
      <div className="md-meta">
        <div>
          <p className="caption">Derived Markdown location</p>
          <div className="uri">{uri}</div>
        </div>
        <div className="row two">
          {sizeBytes != null ? (
            <dl className="fact">
              <dt>Size</dt>
              <dd>{formatBytes(sizeBytes)}</dd>
            </dl>
          ) : (
            <span />
          )}
          {sha256 ? (
            <dl className="fact">
              <dt>SHA-256</dt>
              <dd>{sha256.slice(0, 16)}…</dd>
            </dl>
          ) : null}
        </div>
      </div>
      {loading ? <p className="muted">Loading Markdown from FastAPI.</p> : null}
      <ErrorBanner error={error} />
      {artifact ? (
        <>
          <div className="md-toolbar">
            <div className="tabs">
              <button
                type="button"
                className={tab === "preview" ? "active" : undefined}
                onClick={() => setTab("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                className={tab === "raw" ? "active" : undefined}
                onClick={() => setTab("raw")}
              >
                Raw Markdown
              </button>
            </div>
            <div className="md-toolbar-actions">
              <button type="button" className="btn" onClick={() => void copyMarkdown()}>
                {copied ? "Copied" : "Copy Markdown"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(artifact.filename || "artifact.md", artifact.content)
                }
              >
                Download
              </button>
            </div>
          </div>
          <div className="md-reader">
            {tab === "preview" ? (
              <article className="markdown">
                <ReactMarkdown>{artifact.content}</ReactMarkdown>
              </article>
            ) : (
              <pre className="raw-md">{artifact.content}</pre>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
