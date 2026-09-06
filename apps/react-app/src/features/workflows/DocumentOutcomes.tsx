import { useState } from "react"
import ReactMarkdown from "react-markdown"

import type { DocumentOutcome } from "../../types/workflows"
import { statusLabel } from "./workflowState"
import { MarkdownArtifact } from "./MarkdownArtifact"

type DocumentOutcomesProps = {
  documents: DocumentOutcome[]
}

function sourceName(uri: string): string {
  return uri.split("/").at(-1) || uri
}

export function DocumentOutcomes({ documents }: DocumentOutcomesProps) {
  const [visibleArtifacts, setVisibleArtifacts] = useState<Set<string>>(new Set())

  if (documents.length === 0) return null

  function showArtifact(uri: string) {
    setVisibleArtifacts((current) => new Set(current).add(uri))
  }

  return (
    <section aria-labelledby="documents-title" className="documents-section">
      <div className="section-heading">
        <div>
          <h2 id="documents-title">Document outcomes</h2>
          <p>Extraction and analysis results for each source PDF.</p>
        </div>
      </div>
      <div className="document-list">
        {documents.map((document) => (
          <article className="document-outcome" key={document.s3_path}>
            <header>
              <div>
                <h3>{sourceName(document.s3_path)}</h3>
                <code>{document.s3_path}</code>
              </div>
              <span className={`document-status document-${document.status}`}>
                {statusLabel(document.status)}
              </span>
            </header>
            {document.error ? <p className="document-error">{document.error}</p> : null}
            {document.analysis ? (
              <>
                <div className="analysis-grid">
                  <section>
                    <h4>Summary</h4>
                    <ReactMarkdown>{document.analysis.summary}</ReactMarkdown>
                  </section>
                  <section>
                    <h4>Key risks</h4>
                    <ReactMarkdown>{document.analysis.key_risks}</ReactMarkdown>
                  </section>
                </div>
                <dl className="processing-facts">
                  <div>
                    <dt>Chunks</dt>
                    <dd>{document.analysis.chunks_processed}</dd>
                  </div>
                  <div>
                    <dt>Characters</dt>
                    <dd>{document.analysis.characters_processed.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="document-artifact-row">
                  <code>{document.analysis.artifact.s3_path}</code>
                  {!visibleArtifacts.has(document.analysis.artifact.s3_path) ? (
                    <button
                      className="button button-secondary"
                      onClick={() => showArtifact(document.analysis!.artifact.s3_path)}
                      type="button"
                    >
                      Preview Markdown
                    </button>
                  ) : null}
                </div>
                {visibleArtifacts.has(document.analysis.artifact.s3_path) ? (
                  <MarkdownArtifact
                    contentType={document.analysis.artifact.content_type}
                    sha256={document.analysis.artifact.sha256}
                    sizeBytes={document.analysis.artifact.size_bytes}
                    uri={document.analysis.artifact.s3_path}
                  />
                ) : null}
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
