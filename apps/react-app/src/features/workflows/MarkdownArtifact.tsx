import { useId, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown from "react-markdown"

import { api } from "../../api/client"
import { Feedback } from "../../components/Feedback"

type MarkdownArtifactProps = {
  uri: string
  sizeBytes?: number
  sha256?: string
  contentType?: string
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "Unavailable"
  if (value < 1024) return `${value} bytes`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function MarkdownArtifact({
  uri,
  sizeBytes,
  sha256,
  contentType,
}: MarkdownArtifactProps) {
  const titleId = useId()
  const [view, setView] = useState<"preview" | "raw">("preview")
  const markdown = useQuery({
    queryKey: ["markdown", uri],
    queryFn: () => api.getMarkdown(uri),
    staleTime: Number.POSITIVE_INFINITY,
  })

  return (
    <section aria-labelledby={titleId} className="artifact-section">
      <div className="section-heading artifact-heading">
        <div>
          <h2 id={titleId}>Markdown artifact</h2>
          <code className="artifact-location">{uri}</code>
        </div>
        <a className="button button-secondary" href={api.markdownUrl(uri, true)}>
          Download Markdown
        </a>
      </div>

      <dl className="artifact-metadata">
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(sizeBytes)}</dd>
        </div>
        <div>
          <dt>Content type</dt>
          <dd>{contentType || "Unavailable"}</dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd className="hash-value">{sha256 || "Unavailable"}</dd>
        </div>
      </dl>

      <div aria-label="Markdown view" className="content-tabs" role="tablist">
        <button
          aria-selected={view === "preview"}
          className={view === "preview" ? "is-selected" : ""}
          onClick={() => setView("preview")}
          role="tab"
          type="button"
        >
          Preview
        </button>
        <button
          aria-selected={view === "raw"}
          className={view === "raw" ? "is-selected" : ""}
          onClick={() => setView("raw")}
          role="tab"
          type="button"
        >
          Raw
        </button>
      </div>

      {markdown.isPending ? (
        <div className="document-surface loading-line" role="status">
          Loading Markdown…
        </div>
      ) : markdown.isError ? (
        <Feedback
          actionLabel="Retry"
          onAction={() => void markdown.refetch()}
          tone="error"
        >
          {markdown.error instanceof Error
            ? markdown.error.message
            : "Markdown preview is unavailable."}
        </Feedback>
      ) : view === "preview" ? (
        <article className="document-surface markdown-preview">
          <ReactMarkdown>{markdown.data}</ReactMarkdown>
        </article>
      ) : (
        <pre className="document-surface markdown-raw">{markdown.data}</pre>
      )}
    </section>
  )
}
