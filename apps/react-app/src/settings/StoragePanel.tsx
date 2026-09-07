import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { OperationalSettings } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { formatBytes } from "../lib/s3";
import { useStore } from "../state/store";

export function StoragePanel() {
  const { state } = useStore();
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((err: unknown) => setError(err));
  }, [state.apiBaseUrl]);

  return (
    <div className="stack">
      <header className="settings-section-head">
        <span className="settings-scope read-only">Read-only</span>
        <h2>Object storage</h2>
        <p className="muted">
          The current FastAPI process reports these S3-compatible storage and
          upload limits.
        </p>
      </header>
      <ErrorBanner error={error} />
      {!settings && !error ? (
        <div className="empty-state compact">Loading storage settings…</div>
      ) : null}
      {settings ? (
        <div className="storage-facts">
          <dl className="settings-fact">
            <dt>S3 configured</dt>
            <dd>
              <span className={`config-status ${settings.s3_configured ? "ok" : "err"}`}>
                {settings.s3_configured ? "Connected" : "Not configured"}
              </span>
            </dd>
          </dl>
          <dl className="settings-fact">
            <dt>Bucket</dt>
            <dd>{settings.s3_bucket || "Not reported"}</dd>
          </dl>
          <dl className="settings-fact">
            <dt>Batch limit</dt>
            <dd>{settings.upload_max_files} PDFs</dd>
          </dl>
          <dl className="settings-fact">
            <dt>Per-file limit</dt>
            <dd>{formatBytes(settings.upload_max_bytes)}</dd>
          </dl>
        </div>
      ) : null}
      {settings?.s3_endpoint_url ? (
        <>
          <p className="caption">iDrive E2 / S3 endpoint</p>
          <div className="uri">{settings.s3_endpoint_url}</div>
        </>
      ) : null}
      <div className="settings-callout">
        <strong>Managed by environment</strong>
        <span>
          Change the S3 bucket, endpoint, and credentials in the service
          environment, then restart the affected containers.
        </span>
      </div>
    </div>
  );
}
