import assert from "node:assert/strict";
import test from "node:test";
import * as settings from "./settings.ts";

test("normalizes browser connection settings and clamps polling", () => {
  assert.deepEqual(settings.normalizeConnectionSettings(" /api/ ", 1), {
    apiUrl: "/api",
    pollIntervalSeconds: 2,
  });
  assert.deepEqual(
    settings.normalizeConnectionSettings("https://api.example.com/", 120),
    {
      apiUrl: "https://api.example.com",
      pollIntervalSeconds: 60,
    },
  );
});

test("rejects unsupported API base URLs", () => {
  assert.throws(() => settings.normalizeConnectionSettings("", 3), /base URL/);
  assert.throws(
    () => settings.normalizeConnectionSettings("ftp://api.example.com", 3),
    /HTTP URL/,
  );
});

test("validates model settings before sending them to FastAPI", () => {
  assert.deepEqual(
    settings.normalizeModelSettings({
      model: " vendor/model ",
      baseUrl: " https://models.example.com/v1/ ",
      timeoutSeconds: 30,
      apiKey: " secret ",
    }),
    {
      model: "vendor/model",
      base_url: "https://models.example.com/v1",
      request_timeout_seconds: 30,
      api_key: "secret",
    },
  );
  assert.throws(
    () =>
      settings.normalizeModelSettings({
        model: "",
        baseUrl: "https://models.example.com/v1",
        timeoutSeconds: 30,
        apiKey: "",
      }),
    /model ID/,
  );
});
