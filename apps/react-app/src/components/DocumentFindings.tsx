import type { ContractDocumentProgress, DocumentOutcome } from "../api/types";
import { ReportList, SummaryProse } from "./ReportSections";

export function DocumentFindings({
  documents,
}: {
  documents: DocumentOutcome[];
  animationPrefix?: string;
}) {
  if (!documents.length) {
    return <p className="muted">No document outcomes were returned.</p>;
  }
  return (
    <section className="result-section">
      <div className="result-section-head">
        <div>
          <h3>Document summary</h3>
          <p className="muted">
            {documents.length} document{documents.length === 1 ? "" : "s"}{" "}
            summarized from the Markdown already produced.
          </p>
        </div>
      </div>
      <div className="finding-list">
        {documents.map((document, index) => {
          const name =
            document.s3_path.split("/").pop() || `Document ${index + 1}`;
          return (
            <details
              key={document.s3_path}
              className={`finding-card ${document.status}`}
              open={index === 0 || document.status === "failed"}
            >
              <summary>
                <span className={`status-chip ${document.status}`}>
                  {document.status}
                </span>
                <span className="finding-name">
                  {index + 1}. {name}
                </span>
              </summary>
              {document.status === "failed" ? (
                <div className="banner err">
                  {document.error || "Document processing failed."}
                </div>
              ) : document.analysis ? (
                <div className="finding-body">
                  <section className="report-block">
                    <div className="report-block-head">
                      <h4>Summary</h4>
                    </div>
                    <SummaryProse text={document.analysis.summary} />
                  </section>
                  <ReportList
                    title="Risks"
                    text={document.analysis.key_risks}
                    emptyLabel="No document risks were returned."
                    tone="risk"
                  />
                  <div className="row two">
                    <dl className="fact">
                      <dt>Chunks processed</dt>
                      <dd>{document.analysis.chunks_processed}</dd>
                    </dl>
                    <dl className="fact">
                      <dt>Characters processed</dt>
                      <dd>{document.analysis.characters_processed}</dd>
                    </dl>
                  </div>
                  <p className="caption">Derived Markdown artifact</p>
                  <div className="uri">{document.analysis.artifact.s3_path}</div>
                </div>
              ) : (
                <p className="muted">
                  No analysis payload was returned for this document.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}

export function DocumentProgress({
  documents,
}: {
  documents: ContractDocumentProgress[];
}) {
  if (!documents.length) {
    return (
      <p className="muted">
        Child document outcomes appear here when Temporal reports them.
      </p>
    );
  }
  const failed = documents.filter((item) => item.status === "failed").length;
  return (
    <section className="result-section">
      <div className="result-section-head">
        <div>
          <h3>Document fan-out</h3>
          <p className="muted">
            Each document is summarized from the Markdown already produced. The
            PDF is not uploaded again.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Source</th>
              <th>Status</th>
              <th>Chunks</th>
              <th>Characters</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document, index) => (
              <tr key={document.s3_path}>
                <td>{index + 1}</td>
                <td>{document.s3_path}</td>
                <td>
                  <span className={`status-chip ${document.status}`}>
                    {document.status}
                  </span>
                </td>
                <td>{document.chunks_processed ?? ""}</td>
                <td>{document.characters_processed ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {failed ? (
        <div className="banner warn">
          {failed} document(s) failed. Any resulting report is partial.
        </div>
      ) : null}
    </section>
  );
}
