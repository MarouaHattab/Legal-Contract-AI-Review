import { useState } from "react";
import { api, getDefaultApiBaseUrl } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { useStore } from "../state/store";

export function ConnectionPanel() {
  const { state, setConnection } = useStore();
  const [apiUrl, setApiUrl] = useState(state.apiBaseUrl || getDefaultApiBaseUrl());
  const [poll, setPoll] = useState(state.pollIntervalSeconds);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);

  function save() {
    const normalized = apiUrl.trim();
    if (!normalized) {
      setError(new Error("Enter a FastAPI base URL."));
      return;
    }
    setConnection(normalized, Math.min(60, Math.max(2, poll)));
    setMessage("Connection settings apply to this browser session only.");
    setError(null);
  }

  async function test() {
    setError(null);
    setMessage("");
    try {
      await api.readiness(apiUrl.trim());
      setMessage("FastAPI is reachable and Temporal is ready.");
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <h2>Connection</h2>
      <p className="muted">
        The UI calls FastAPI from this browser. Docker serves the API at /api.
      </p>
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
      </div>
      <div className="settings-actions">
        <button type="button" className="btn primary" onClick={save}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => void test()}>
          Test connection
        </button>
      </div>
    </div>
  );
}
