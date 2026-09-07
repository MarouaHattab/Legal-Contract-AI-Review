import { useState } from "react";
import { api, getDefaultApiBaseUrl } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { normalizeConnectionSettings } from "../lib/settings";
import { useStore } from "../state/store";

export function ConnectionPanel() {
  const { state, setConnection } = useStore();
  const [apiUrl, setApiUrl] = useState(state.apiBaseUrl || getDefaultApiBaseUrl());
  const [poll, setPoll] = useState(state.pollIntervalSeconds);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);

  function save() {
    try {
      const normalized = normalizeConnectionSettings(apiUrl, poll);
      setApiUrl(normalized.apiUrl);
      setPoll(normalized.pollIntervalSeconds);
      setConnection(normalized.apiUrl, normalized.pollIntervalSeconds);
      setMessage("Saved for this browser session.");
      setError(null);
    } catch (err) {
      setMessage("");
      setError(err);
    }
  }

  async function test() {
    setError(null);
    setMessage("");
    setTesting(true);
    try {
      const normalized = normalizeConnectionSettings(apiUrl, poll);
      await api.readiness(normalized.apiUrl);
      setMessage("FastAPI is reachable and Temporal is ready.");
    } catch (err) {
      setError(err);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="stack">
      <header className="settings-section-head">
        <span className="settings-scope">Browser session</span>
        <h2>API connection</h2>
        <p className="muted">
          Choose where this browser sends document and workflow requests.
          Docker's default reverse-proxy path is <code>/api</code>.
        </p>
      </header>
      <ErrorBanner error={error} />
      {message ? <div className="banner ok">{message}</div> : null}
      <div className="field">
        <label htmlFor="api-url">FastAPI base URL</label>
        <input
          id="api-url"
          type="text"
          value={apiUrl}
          onChange={(event) => setApiUrl(event.target.value)}
        />
        <p className="field-help">
          Use a relative path such as <code>/api</code>, or a full HTTP URL for
          a separately hosted API.
        </p>
      </div>
      <div className="field">
        <label htmlFor="poll">Status refresh interval (seconds)</label>
        <input
          id="poll"
          type="number"
          min={2}
          max={60}
          step={1}
          value={poll}
          onChange={(event) => setPoll(Number(event.target.value) || 3)}
        />
        <p className="field-help">
          Applies only while workflows are active. Terminal workflows stop
          polling automatically.
        </p>
      </div>
      <div className="settings-actions">
        <button type="button" className="btn primary" onClick={save}>
          Save
        </button>
        <button
          type="button"
          className="btn"
          disabled={testing}
          onClick={() => void test()}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div className="settings-callout">
        <strong>Scope</strong>
        <span>
          These values are stored in session storage and do not change the
          FastAPI or Temporal container configuration.
        </span>
      </div>
    </div>
  );
}
