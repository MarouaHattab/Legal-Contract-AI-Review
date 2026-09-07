import { useState } from "react";
import { ConnectionPanel } from "../settings/ConnectionPanel";
import { LlmPanel } from "../settings/LlmPanel";
import { StoragePanel } from "../settings/StoragePanel";

const SECTIONS = [
  { id: "connection", folio: "01", label: "Connection" },
  { id: "storage", folio: "02", label: "Storage" },
  { id: "model", folio: "03", label: "Model" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsPage() {
  const [section, setSection] = useState<SectionId>("connection");

  return (
    <>
      <p className="eyebrow">Configuration desk</p>
      <h1 className="page-title">Application settings</h1>
      <p className="page-meta">
        <span>Browser session</span>
        <span>FastAPI memory</span>
        <span>Worker environment</span>
      </p>
      <p className="page-lead settings-lead">
        Connection preferences live in this browser. Storage is read-only here,
        while model changes are held by the current FastAPI process.
      </p>
      <div className="settings-desk">
        <nav className="settings-index" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="folio">{item.folio}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {section === "connection" ? <ConnectionPanel /> : null}
          {section === "storage" ? <StoragePanel /> : null}
          {section === "model" ? <LlmPanel /> : null}
        </div>
      </div>
    </>
  );
}
