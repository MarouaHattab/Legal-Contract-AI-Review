import { useState, type ReactNode } from "react";
import type {
  ContractReport,
  ContractReportQuery,
  ContractReviewResult,
  DocumentOutcome,
} from "../api/types";
import { riskLabel, riskTone } from "../lib/risk";
import { downloadText } from "../lib/s3";
import { terminalPresentation } from "../lib/workflow";
import { ReportList, RiskHero } from "./ReportSections";

export function reportMarkdown(input: {
  workflowId: string;
  reviewer: string;
  revision: number;
  completeness: string;
  report: ContractReport | null;
  documents?: DocumentOutcome[];
  finalStatus?: string;
}): string {
  const lines = [
    "# Contract review report",
    "",
    `- Workflow ID: \`${input.workflowId}\``,
    `- Reviewer: ${input.reviewer || "Unassigned"}`,
    `- Revision: ${input.revision}`,
    `- Completeness: ${input.completeness}`,
  ];
  if (input.finalStatus) {
    lines.push(`- Final status: ${input.finalStatus}`);
  }
  lines.push("");
  if (!input.report) {
    lines.push("The report payload was not returned.");
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    "## Overall risk",
    "",
    input.report.overall_risk_level,
    "",
    "## Recommendations",
    "",
    input.report.recommended_actions,
    "",
    "## Cross-contract risks",
    "",
    input.report.top_cross_contract_risks,
    "",
  );
  if (input.documents?.length) {
    lines.push("## Document findings", "");
    input.documents.forEach((document, index) => {
      lines.push(
        `### Document ${index + 1}`,
        "",
        `- Source: \`${document.s3_path}\``,
        `- Status: ${document.status}`,
      );
      if (document.error) {
        lines.push(`- Error: ${document.error}`);
      }
      if (document.analysis) {
        lines.push(
          "",
          "#### Summary",
          "",
          document.analysis.summary,
          "",
          "#### Risks",
          "",
          document.analysis.key_risks,
          "",
          `Derived artifact: \`${document.analysis.artifact.s3_path}\``,
          "",
        );
      }
    });
  }
  return `${lines.join("\n").trim()}\n`;
}

export function ContractReportBlock({
  report,
  title,
  actions,
}: {
  report: ContractReport | null;
  title: string;
  animationKey?: string;
  actions?: ReactNode;
}) {
  if (!report) {
    return (
      <section className="result-section">
        <h3>{title}</h3>
        <p className="muted">The report is not available yet.</p>
      </section>
    );
  }
  const tone = riskTone(report.overall_risk_level);
  return (
    <section className="result-section">
      <div className="result-section-head">
        <h3>{title}</h3>
        <div className="result-section-tools">
          <span className={`risk-chip ${tone}`}>{riskLabel(tone)} risk</span>
          {actions}
        </div>
      </div>
      <div className="report-read">
        <RiskHero text={report.overall_risk_level} />
        <ReportList
          title="Recommendations"
          text={report.recommended_actions}
          emptyLabel="No recommended actions were returned."
        />
        <ReportList
          title="Cross-contract risks"
          text={report.top_cross_contract_risks}
          emptyLabel="No cross-contract risks were returned."
          tone="risk"
        />
      </div>
    </section>
  );
}

export function LiveOrFinalReport({
  payload,
}: {
  payload: ContractReportQuery | ContractReviewResult;
}) {
  const [copied, setCopied] = useState(false);
  const isFinal = "final_status" in payload;
  const revision = isFinal ? payload.revision_count : payload.current_revision;
  const finalStatus = isFinal ? payload.final_status : "";
  const title = isFinal
    ? "Final report"
    : `Current report · revision ${payload.current_revision}`;
  const markdown = reportMarkdown({
    workflowId: payload.workflow_id,
    reviewer: payload.reviewer,
    revision,
    completeness: payload.completeness,
    report: payload.report,
    documents: payload.documents,
    finalStatus,
  });

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <div className="report-facts">
        <dl className="fact">
          <dt>Reviewer</dt>
          <dd>{payload.reviewer || "Unassigned"}</dd>
        </dl>
        <dl className="fact">
          <dt>Revision</dt>
          <dd>{revision}</dd>
        </dl>
        <dl className="fact">
          <dt>Completeness</dt>
          <dd>{payload.completeness}</dd>
        </dl>
      </div>
      <ContractReportBlock
        report={payload.report}
        title={title}
        animationKey={`${payload.workflow_id}:${revision}:${finalStatus || "live"}`}
        actions={
          payload.report ? (
            <>
              <button type="button" className="btn" onClick={() => void copyReport()}>
                {copied ? "Copied" : "Copy report"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => downloadText(`${payload.workflow_id}.md`, markdown)}
              >
                Download report
              </button>
            </>
          ) : null
        }
      />
    </div>
  );
}

export function TerminalBanner({
  workflowType,
  finalStatus,
}: {
  workflowType: string;
  finalStatus: string;
}) {
  const presentation = terminalPresentation(workflowType, finalStatus);
  const cls =
    presentation.level === "success"
      ? "banner ok"
      : presentation.level === "warning"
        ? "banner warn"
        : "banner err";
  return (
    <div className={cls}>
      <strong>{presentation.title}</strong> — {presentation.message}
    </div>
  );
}
