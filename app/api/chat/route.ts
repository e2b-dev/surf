import { Sandbox } from "@e2b/desktop";
import { ComputerModel, SSEEvent, SSEEventType } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  createStreamingResponse,
} from "@/lib/streaming";
import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { OpenAIComputerStreamer } from "@/lib/streaming/openai";
import { GoogleComputerStreamer } from "@/lib/streaming/google";
import { logError, logDebug, logSuccess } from "@/lib/logger";
import { ResolutionScaler } from "@/lib/streaming/resolution";

export const maxDuration = 800;

class StreamerFactory {
  static getStreamer(
    model: ComputerModel,
    desktop: Sandbox,
    resolution: [number, number]
  ): ComputerInteractionStreamerFacade {
    const resolutionScaler = new ResolutionScaler(desktop, resolution);

    switch (model) {
      case "google":
        return new GoogleComputerStreamer(desktop, resolutionScaler);
      case "anthropic":
      // currently not implemented
      /* return new AnthropicComputerStreamer(desktop, resolutionScaler); */
      case "openai":
      default:
        return new OpenAIComputerStreamer(desktop, resolutionScaler);
    }
  }
}

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
    model = "openai",
  } = await request.json();

  logDebug(
    `POST /api/chat - Model: ${model}, SandboxId: ${sandboxId || "new"}`
  );

  const apiKey = process.env.E2B_API_KEY;

  if (!apiKey) {
    logError("E2B_API_KEY not found in environment");
    return new Response("E2B API key not found", { status: 500 });
  }

  // validate model-specific API keys
  if (model === "google" && !process.env.GEMINI_API_KEY) {
    logError("GEMINI_API_KEY not found in environment");
    return new Response("GEMINI_API_KEY environment variable not found", {
      status: 500,
    });
  }

  if (model === "openai" && !process.env.OPENAI_API_KEY) {
    logError("OPENAI_API_KEY not found in environment");
    return new Response("OPENAI_API_KEY environment variable not found", {
      status: 500,
    });
  }

  let desktop: Sandbox | undefined;
  let activeSandboxId = sandboxId;
  let vncUrl: string | undefined;

  try {
    if (!activeSandboxId) {
      logDebug("Creating new sandbox...");
      const newSandbox = await Sandbox.create({
        resolution,
        dpi: 96,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });

      await newSandbox.stream.start();

      activeSandboxId = newSandbox.sandboxId;
      vncUrl = newSandbox.stream.getUrl();
      desktop = newSandbox;
      logSuccess(`Sandbox created: ${activeSandboxId}`);
    } else {
      logDebug(`Connecting to existing sandbox: ${activeSandboxId}`);
      desktop = await Sandbox.connect(activeSandboxId);
      logSuccess(`Connected to sandbox: ${activeSandboxId}`);
    }

    if (!desktop) {
      logError("Desktop connection failed");
      return new Response("Failed to connect to sandbox", { status: 500 });
    }

    desktop.setTimeout(SANDBOX_TIMEOUT_MS);

    try {
      logDebug(`Creating ${model} streamer...`);
      const streamer = StreamerFactory.getStreamer(
        model as ComputerModel,
        desktop,
        resolution
      );
      logSuccess(`${model} streamer created`);

      if (!sandboxId && activeSandboxId && vncUrl) {
        async function* stream(): AsyncGenerator<SSEEvent<typeof model>> {
          yield {
            type: SSEEventType.SANDBOX_CREATED,
            sandboxId: activeSandboxId,
            vncUrl: vncUrl as string,
          };

          yield* streamer.stream({ messages, signal });
        }

        return createStreamingResponse(stream());
      } else {
        return createStreamingResponse(streamer.stream({ messages, signal }));
      }
    } catch (error) {
      logError(`Error from ${model} streaming service:`, error);

      return new Response(
        "An error occurred with the AI service. Please try again.",
        { status: 500 }
      );
    }
  } catch (error) {
    logError("Error in sandbox setup:", error);
    return new Response("Failed to connect to sandbox", { status: 500 });
  }
}
