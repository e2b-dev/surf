export const DEFAULT_SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;
export const SANDBOX_PROVIDER_MAX_TIMEOUT_MS = 60 * 60 * 1000;

export const SANDBOX_TIMEOUT_OPTIONS = [
  { label: "15 minutes", minutes: 15, ms: 15 * 60 * 1000 },
  { label: "30 minutes", minutes: 30, ms: 30 * 60 * 1000 },
  { label: "1 hour", minutes: 60, ms: DEFAULT_SANDBOX_TIMEOUT_MS },
  { label: "8 hours", minutes: 8 * 60, ms: 8 * 60 * 60 * 1000 },
  { label: "12 hours", minutes: 12 * 60, ms: 12 * 60 * 60 * 1000 },
  { label: "24 hours", minutes: 24 * 60, ms: 24 * 60 * 60 * 1000 },
  { label: "36 hours", minutes: 36 * 60, ms: 36 * 60 * 60 * 1000 },
] as const;

export const SANDBOX_TIMEOUT_MS = DEFAULT_SANDBOX_TIMEOUT_MS;

export function getAllowedSandboxTimeoutMs(value: unknown): number {
  const timeoutMs =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return (
    SANDBOX_TIMEOUT_OPTIONS.find((option) => option.ms === timeoutMs)?.ms ??
    DEFAULT_SANDBOX_TIMEOUT_MS
  );
}

export function getSandboxProviderTimeoutMs(value: unknown): number {
  return Math.min(getAllowedSandboxTimeoutMs(value), SANDBOX_PROVIDER_MAX_TIMEOUT_MS);
}

// Resolution boundaries used by the sandbox and optional screenshot scaling.
// The current OpenAI computer-use path sends original-detail screenshots and
// does not actively scale them before upload.
export const MAX_RESOLUTION_WIDTH = 1920;
export const MAX_RESOLUTION_HEIGHT = 1080;
export const MIN_RESOLUTION_WIDTH = 640;
export const MIN_RESOLUTION_HEIGHT = 480;

// Default resolution used when none is specified
// NOTE: This should be within the max/min bounds defined above,
// otherwise it will be scaled automatically
export const DEFAULT_RESOLUTION: [number, number] = [1920, 1080];

// Model identifier
export const OPENAI_MODEL = "gpt-5.4";
