export const SANDBOX_TIMEOUT_MS = 300_000; // 5 minutes in milliseconds

// Resolution boundaries used by the sandbox and optional screenshot scaling.
// The current OpenAI computer-use path sends original-detail screenshots and
// does not actively scale them before upload.
export const MAX_RESOLUTION_WIDTH = 1024;
export const MAX_RESOLUTION_HEIGHT = 768;
export const MIN_RESOLUTION_WIDTH = 640;
export const MIN_RESOLUTION_HEIGHT = 480;

// Default resolution used when none is specified
// NOTE: This should be within the max/min bounds defined above,
// otherwise it will be scaled automatically
export const DEFAULT_RESOLUTION: [number, number] = [1024, 720];

export type AIProvider = "openai" | "litellm";

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider !== "openai" && provider !== "litellm") {
    throw new Error("AI_PROVIDER must be either 'openai' or 'litellm'");
  }
  return provider;
}

export function getOpenAIClientOptions(): {
  apiKey?: string;
  baseURL?: string;
} {
  if (getAIProvider() === "litellm") {
    const apiKey = process.env.LITELLM_API_KEY;
    if (!apiKey) {
      throw new Error("LITELLM_API_KEY is required when AI_PROVIDER=litellm");
    }
    return {
      apiKey,
      baseURL: (process.env.LITELLM_BASE_URL || "http://localhost:4000/v1").replace(
        /\/$/,
        ""
      ),
    };
  }

  return {};
}

export function getAIModel(): string {
  if (getAIProvider() === "litellm") {
    const model = process.env.LITELLM_MODEL;
    if (!model) {
      throw new Error("LITELLM_MODEL is required when AI_PROVIDER=litellm");
    }
    return model;
  }
  return process.env.OPENAI_MODEL || "gpt-5.4";
}
