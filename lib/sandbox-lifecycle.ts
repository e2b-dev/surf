interface SandboxLifecycleOptions {
  apiKey?: string;
  domain?: string;
  fetch?: typeof fetch;
}

export class E2BSandboxLifecycleError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "E2BSandboxLifecycleError";
  }
}

export async function pauseSandboxProvider(
  sandboxId: string,
  options: SandboxLifecycleOptions = {}
): Promise<void> {
  await requestSandboxLifecycle(sandboxId, "pause", undefined, options);
}

export async function resumeSandboxProvider(
  sandboxId: string,
  timeoutMs: number,
  options: SandboxLifecycleOptions = {}
): Promise<void> {
  await requestSandboxLifecycle(
    sandboxId,
    "resume",
    {
      autoPause: false,
      timeout: Math.ceil(timeoutMs / 1000),
    },
    options
  );
}

function getApiBaseUrl(options: SandboxLifecycleOptions): string {
  const domain = options.domain ?? process.env.E2B_DOMAIN ?? "e2b.app";
  return `https://api.${domain}`;
}

async function requestSandboxLifecycle(
  sandboxId: string,
  action: "pause" | "resume",
  body: Record<string, unknown> | undefined,
  options: SandboxLifecycleOptions
): Promise<void> {
  const apiKey = options.apiKey ?? process.env.E2B_API_KEY;

  if (!apiKey) {
    throw new E2BSandboxLifecycleError("Sandbox API key not found", 401);
  }

  const requestFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    "X-API-KEY": apiKey,
  };

  if (body) {
    headers["content-type"] = "application/json";
  }

  const response = await requestFetch(
    `${getApiBaseUrl(options)}/sandboxes/${encodeURIComponent(sandboxId)}/${action}`,
    {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (response.ok) {
    return;
  }

  throw new E2BSandboxLifecycleError(
    await getErrorMessage(response),
    response.status
  );
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `E2B request failed with status ${response.status}`;

    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? text;
  } catch {
    return `E2B request failed with status ${response.status}`;
  }
}
