import { afterEach, describe, expect, it, vi } from "vitest";

import { getAIModel, getAIProvider, getOpenAIClientOptions } from "./config";

describe("LiteLLM configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes the proxy URL and returns the configured key and alias", () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_API_KEY", "sk-proxy");
    vi.stubEnv("LITELLM_BASE_URL", "https://proxy.example/v1/");
    vi.stubEnv("LITELLM_MODEL", "claude-fallback");

    expect(getAIProvider()).toBe("litellm");
    expect(getOpenAIClientOptions()).toEqual({
      apiKey: "sk-proxy",
      baseURL: "https://proxy.example/v1",
    });
    expect(getAIModel()).toBe("claude-fallback");
  });

  it("rejects an unsupported provider", () => {
    vi.stubEnv("AI_PROVIDER", "unknown");
    expect(() => getAIProvider()).toThrow("AI_PROVIDER must be either");
  });

  it("requires a dedicated LiteLLM API key", () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("OPENAI_API_KEY", "must-not-be-used");
    vi.stubEnv("LITELLM_API_KEY", "");
    expect(() => getOpenAIClientOptions()).toThrow("LITELLM_API_KEY is required");
  });

  it("requires an explicit LiteLLM model alias", () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "");
    expect(() => getAIModel()).toThrow("LITELLM_MODEL is required");
  });
});
