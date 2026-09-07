import type { ReactNode } from "react";
import type { ReviewStep } from "../api/types";
import { StepGlyph } from "./Icons";

export function StepFrame({
  title,
  description,
  icon,
  children,
  footer,
}: {
  title: string;
  description: string;
  icon: ReviewStep;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="step-frame">
      <header className="step-frame-head">
        <div className="icon-tile">
          <StepGlyph name={icon} />
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="step-frame-body">{children}</div>
      {footer ? <div className="step-frame-footer">{footer}</div> : null}
    </section>
  );
}
