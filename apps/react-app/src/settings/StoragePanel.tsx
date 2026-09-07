import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { OperationalSettings } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
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
      <h2>Storage</h2>
      <p className="muted">
        Values reported by FastAPI. Object storage is not configured in the
        browser.
      </p>
      <ErrorBanner error={error} />
      {settings ? (
        <div className="row three">
          <dl className="fact">
            <dt>S3 configured</dt>
            <dd>{settings.s3_configured ? "Yes" : "No"}</dd>
          </dl>
          <dl className="fact">
            <dt>Bucket</dt>
            <dd>{settings.s3_bucket || "Not reported"}</dd>
          </dl>
          <dl className="fact">
            <dt>Upload limit</dt>
            <dd>{settings.upload_max_files} files</dd>
          </dl>
        </div>
      ) : null}
      {settings?.s3_endpoint_url ? (
        <>
          <p className="caption">iDrive E2 / S3 endpoint</p>
          <div className="uri">{settings.s3_endpoint_url}</div>
        </>
      ) : null}
    </div>
  );
}
