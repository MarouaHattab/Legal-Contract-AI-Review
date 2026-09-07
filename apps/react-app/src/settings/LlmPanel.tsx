import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { OperationalSettings } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { normalizeModelSettings } from "../lib/settings";
import { useStore } from "../state/store";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export function LlmPanel() {
  const { state } = useStore();
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [provider, setProvider] = useState("OpenRouter");
  const [baseUrl, setBaseUrl] = useState(OPENROUTER_BASE_URL);
  const [model, setModel] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<"save" | "test" | "">("");

  useEffect(() => {
    api
      .getSettings()
      .then((snapshot) => {
        setSettings(snapshot);
        const llm = snapshot.llm;
        setProvider(
          !llm.base_url || llm.base_url.includes("openrouter.ai")
            ? "OpenRouter"
            : "Custom OpenAI-compatible",
        );
        setBaseUrl(llm.base_url || OPENROUTER_BASE_URL);
        setModel(llm.model || "");
        setTimeoutSeconds(llm.request_timeout_seconds || 60);
      })
      .catch((err: unknown) => setError(err));
  }, [state.apiBaseUrl]);

  function payload() {
    return normalizeModelSettings({
      model,
      baseUrl,
      timeoutSeconds,
      apiKey,
    });
  }

  async function save() {
    setError(null);
    setMessage("");
    setAction("save");
    try {
      const updated = await api.updateLlmSettings(payload());
      setSettings(updated);
      setApiKey("");
      const hint =
        updated.llm.api_key_hint ||
        (updated.llm.api_key_configured ? "configured" : "not configured");
      setMessage(
        `Saved in FastAPI process memory. API key: ${hint}.`,
      );
    } catch (err) {
      setError(err);
    } finally {
      setAction("");
    }
  }

  async function test() {
    setError(null);
    setMessage("");
    setAction("test");
    try {
      const result = await api.testLlmSettings(payload());
      setMessage(result.message);
    } catch (err) {
      setError(err);
    } finally {
      setAction("");
    }
  }

  return (
    <div className="stack">
      <header className="settings-section-head">
        <span className="settings-scope process">FastAPI process memory</span>
        <h2>Language model</h2>
        <p className="muted">
          Configure the OpenAI-compatible endpoint FastAPI uses for connection
          checks and process-local settings.
        </p>
      </header>
      <ErrorBanner error={error} />
      {message ? <div className="banner ok">{message}</div> : null}
      {!settings && !error ? (
        <div className="empty-state compact">Loading model settings…</div>
      ) : null}
      <div className="worker-boundary" role="note">
        <strong>Worker restart may be required</strong>
        <p>
          Temporal workers load model environment variables when their process
          starts. Saving here does not reconfigure or restart those workers.
        </p>
      </div>
      <div className="field">
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            if (event.target.value === "OpenRouter") {
              setBaseUrl(OPENROUTER_BASE_URL);
            }
          }}
        >
          <option>OpenRouter</option>
          <option>Custom OpenAI-compatible</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="base-url">OpenAI-compatible base URL</label>
        <input
          id="base-url"
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="model">Model ID</label>
        <input
          id="model"
          type="text"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="provider/model-name"
        />
        <p className="field-help">
          Use the exact identifier accepted by the configured provider.
        </p>
      </div>
      <div className="row two">
        <div className="field">
          <label htmlFor="timeout">Request timeout (seconds)</label>
          <input
            id="timeout"
            type="number"
            min={1}
            max={600}
            value={timeoutSeconds}
            onChange={(event) =>
              setTimeoutSeconds(Number(event.target.value) || 60)
            }
          />
        </div>
        <div className="field">
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Leave blank to keep the current key"
            autoComplete="off"
          />
          <p className="field-help">
            Current key: {settings?.llm.api_key_hint || (settings?.llm.api_key_configured ? "configured" : "not configured")}.
          </p>
        </div>
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="btn primary"
          disabled={Boolean(action)}
          onClick={() => void save()}
        >
          {action === "save" ? "Saving…" : "Save model"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(action)}
          onClick={() => void test()}
        >
          {action === "test" ? "Testing…" : "Test model"}
        </button>
      </div>
    </div>
  );
}
