import ReactMarkdown from "react-markdown"

import type { ContractReport as ContractReportModel } from "../../types/workflows"

type ContractReportProps = {
  report: ContractReportModel
  revision?: number
}

export function ContractReport({ report, revision }: ContractReportProps) {
  return (
    <section aria-labelledby="report-title" className="report-section">
      <header className="report-header">
        <div>
          <p className="eyebrow">Risk report</p>
          <h2 id="report-title">
            Contract assessment{revision === undefined ? "" : ` · revision ${revision}`}
          </h2>
        </div>
      </header>
      <div className="report-block report-risk">
        <h3>Overall risk</h3>
        <ReactMarkdown>{report.overall_risk_level}</ReactMarkdown>
      </div>
      <div className="report-block">
        <h3>Cross-contract risks</h3>
        <ReactMarkdown>{report.top_cross_contract_risks}</ReactMarkdown>
      </div>
      <div className="report-block">
        <h3>Recommended actions</h3>
        <ReactMarkdown>{report.recommended_actions}</ReactMarkdown>
      </div>
    </section>
  )
}
