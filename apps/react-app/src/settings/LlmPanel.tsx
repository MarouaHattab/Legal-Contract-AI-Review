import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { OperationalSettings } from "../api/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { useStore } from "../state/store";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "deepseek/deepseek-v4-flash",
  "google/gemini-2.0-flash-001",
];

export function LlmPanel() {
  const { state } = useStore();
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [provider, setProvider] = useState("OpenRouter");
  const [baseUrl, setBaseUrl] = useState(OPENROUTER_BASE_URL);
  const [modelChoice, setModelChoice] = useState(OPENROUTER_MODELS[0]);
  const [customModel, setCustomModel] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);

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
        if (llm.model && !OPENROUTER_MODELS.includes(llm.model)) {
          setModelChoice("Custom model");
          setCustomModel(llm.model);
        } else {
          setModelChoice(llm.model || OPENROUTER_MODELS[0]);
        }
        setTimeoutSeconds(llm.request_timeout_seconds || 60);
      })
      .catch((err: unknown) => setError(err));
  }, [state.apiBaseUrl]);

  const model =
    modelChoice === "Custom model" ? customModel.trim() : modelChoice;

  function payload() {
    return {
      model: model || undefined,
      base_url: baseUrl.trim() || undefined,
      request_timeout_seconds: timeoutSeconds,
      api_key: apiKey.trim() || undefined,
    };
  }

  async function save() {
    setError(null);
    setMessage("");
    try {
      const updated = await api.updateLlmSettings(payload());
      setSettings(updated);
      const hint =
        updated.llm.api_key_hint ||
        (updated.llm.api_key_configured ? "configured" : "not configured");
      setMessage(
        `LLM settings were stored in FastAPI process memory. API key: ${hint}.`,
      );
    } catch (err) {
      setError(err);
    }
  }

  async function test() {
    setError(null);
    setMessage("");
    try {
      const result = await api.testLlmSettings(payload());
      setMessage(result.message);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <h2>Model</h2>
      <p className="muted">
        Suggested provider: OpenRouter. Temporal workers still load their own
        environment at process start. Values saved here stay in FastAPI memory.
      </p>
      <ErrorBanner error={error} />
      {message ? <div className="banner ok">{message}</div> : null}
      {settings ? (
        <p className="caption">
          API key:{" "}
          {settings.llm.api_key_hint ||
            (settings.llm.api_key_configured ? "configured" : "Not configured")}
        </p>
      ) : null}
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
          type="text"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="model">Model</label>
        <select
          id="model"
          value={modelChoice}
          onChange={(event) => setModelChoice(event.target.value)}
        >
          {OPENROUTER_MODELS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          {settings?.llm.model &&
          !OPENROUTER_MODELS.includes(settings.llm.model) ? (
            <option value={settings.llm.model}>{settings.llm.model}</option>
          ) : null}
          <option value="Custom model">Custom model</option>
        </select>
      </div>
      {modelChoice === "Custom model" ? (
        <div className="field">
          <label htmlFor="custom-model">Model ID</label>
          <input
            id="custom-model"
            type="text"
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
          />
        </div>
      ) : null}
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
          />
        </div>
      </div>
      <div className="settings-actions">
        <button type="button" className="btn primary" onClick={() => void save()}>
          Save model
        </button>
        <button type="button" className="btn" onClick={() => void test()}>
          Test model
        </button>
      </div>
    </div>
  );
}
