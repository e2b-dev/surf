import { Sandbox } from "@e2b/desktop";
import { SSEEvent, SSEEventType } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  createStreamingResponse,
} from "@/lib/streaming";
import { SANDBOX_TIMEOUT_MS, SANDBOX_TEMPLATE } from "@/lib/config";
import { OpenAIComputerStreamer } from "@/lib/streaming/openai";
import { buildAuthTask, FORK_AUTH_PROMPT_ID } from "@/lib/fork/config";
import { logError } from "@/lib/logger";

export const maxDuration = 800;

export async function POST(request: Request) {
  const abortController = new AbortController();
  const { signal } = abortController;

  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const {
    messages,
    sandboxId,
    resolution,
    promptId,
  } = await request.json();

  const apiKey = process.env.E2B_API_KEY;

  if (!apiKey) {
    return new Response("E2B API key not found", { status: 500 });
  }

  // Resolve server-side prompts. A `promptId` lets the client trigger a run
  // whose prompt is assembled here from server secrets, so the credential never
  // leaves the server. Any client-supplied `messages` are ignored in that case.
  let effectiveMessages = messages;
  let redactSecrets: string[] = [];
  if (promptId) {
    if (promptId === FORK_AUTH_PROMPT_ID) {
      const username = process.env.DEMO_SITE_USERNAME;
      const password = process.env.DEMO_SITE_PASSWORD;
      if (!username || !password) {
        return new Response("Demo credentials not configured", { status: 500 });
      }
      effectiveMessages = [
        { role: "user", content: buildAuthTask(username, password) },
      ];
      // The agent types this password into the sandbox; redact it from the
      // action stream so it is never echoed back to the browser.
      redactSecrets = [password];
    } else {
      return new Response("Unknown promptId", { status: 400 });
    }
  }

  let desktop: Sandbox | undefined;
  let activeSandboxId = sandboxId;
  let vncUrl: string | undefined;

  try {
    if (!activeSandboxId) {
      const newSandbox = await Sandbox.create(SANDBOX_TEMPLATE, {
        resolution,
        dpi: 96,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });

      await newSandbox.stream.start();

      activeSandboxId = newSandbox.sandboxId;
      vncUrl = newSandbox.stream.getUrl();
      desktop = newSandbox;
    } else {
      desktop = await Sandbox.connect(activeSandboxId);
    }

    if (!desktop) {
      return new Response("Failed to connect to sandbox", { status: 500 });
    }

    desktop.setTimeout(SANDBOX_TIMEOUT_MS);

    try {
      const streamer: ComputerInteractionStreamerFacade =
        new OpenAIComputerStreamer(desktop, resolution, { redactSecrets });

      if (!sandboxId && activeSandboxId && vncUrl) {
        async function* stream(): AsyncGenerator<SSEEvent> {
          yield {
            type: SSEEventType.SANDBOX_CREATED,
            sandboxId: activeSandboxId,
            vncUrl: vncUrl as string,
          };

          yield* streamer.stream({ messages: effectiveMessages, signal });
        }

        return createStreamingResponse(stream());
      } else {
        return createStreamingResponse(
          streamer.stream({ messages: effectiveMessages, signal })
        );
      }
    } catch (error) {
      logError("Error from streaming service:", error);

      return new Response(
        "An error occurred with the AI service. Please try again.",
        { status: 500 }
      );
    }
  } catch (error) {
    logError("Error connecting to sandbox:", error);
    return new Response("Failed to connect to sandbox", { status: 500 });
  }
}
