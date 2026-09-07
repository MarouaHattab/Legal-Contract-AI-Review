import { itemHeading, splitOverallRisk, splitReportItems } from "../lib/reportText";
import { riskTone } from "../lib/risk";

export function RiskHero({ text }: { text: string }) {
  const tone = riskTone(text);
  const { rating, detail } = splitOverallRisk(text);
  return (
    <article className={`risk-hero risk-${tone}`}>
      <div className="risk-hero-rating">
        <p className="caption">Overall risk</p>
        <p className="risk-level">{rating}</p>
        <span className={`risk-chip ${tone}`}>{rating}</span>
      </div>
      <div className="risk-hero-copy">
        <p className="caption">Why this rating</p>
        <p className="risk-hero-detail">{detail}</p>
      </div>
    </article>
  );
}

export function ReportList({
  title,
  text,
  emptyLabel,
  tone = "default",
}: {
  title: string;
  text: string;
  emptyLabel: string;
  tone?: "default" | "risk";
}) {
  const items = splitReportItems(text);
  if (!items.length) {
    return (
      <section className={`report-block tone-${tone}`}>
        <div className="report-block-head">
          <h4>{title}</h4>
        </div>
        <p className="muted">{emptyLabel}</p>
      </section>
    );
  }
  return (
    <section className={`report-block tone-${tone}`}>
      <div className="report-block-head">
        <h4>{title}</h4>
        <span className="count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <ol className="report-list">
        {items.map((item, index) => {
          const parts = itemHeading(item);
          return (
            <li key={`${index}:${item.slice(0, 32)}`} className="report-item">
              <span className="num">{index + 1}</span>
              <div className="report-item-body">
                {parts.title ? <h5>{parts.title}</h5> : null}
                <p>{parts.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SummaryProse({ text }: { text: string }) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : [text.trim()].filter(Boolean);
  return (
    <div className="summary-prose">
      {blocks.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );
}
