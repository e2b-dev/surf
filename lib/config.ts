export const SANDBOX_TIMEOUT_MS = 300_000; // 5 minutes in milliseconds

// Sandbox template used for all fresh desktops. This is our fork of E2B's
// public `desktop` template — identical except for the branded wallpaper.
// Built from sandbox-template/ (see sandbox-template/build.ts).
export const SANDBOX_TEMPLATE = "surf-desktop";

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

// Model identifier
export const OPENAI_MODEL = "gpt-5.4";
