import { Sandbox } from "@e2b/desktop";
import { SSEEvent, SSEEventType } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  createStreamingResponse,
} from "@/lib/streaming";
import { getSandboxProviderTimeoutMs, SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { OpenAIComputerStreamer } from "@/lib/streaming/openai";
import { logError } from "@/lib/logger";
import { PAYCHEX_LOGIN_URL } from "@/lib/paychex-flow";
import { preparePaychexSandbox } from "@/lib/sandbox-bootstrap";
import { withScaledStreamResize } from "@/lib/sandbox-stream";
import { getCurrentUser, getInitializedDatabase } from "@/lib/auth";
import {
  createSandboxRecord,
  getSandboxForUser,
  touchSandboxForUser,
} from "@/lib/auth-store";

export const maxDuration = 800;

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const abortController = new AbortController();
  const { signal } = abortController;
  const db = await getInitializedDatabase();

  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const {
    messages,
    sandboxId,
    resolution,
    bootstrap,
  } = await request.json();

  const apiKey = process.env.E2B_API_KEY;

  if (!apiKey) {
    return new Response("Sandbox API key not found", { status: 500 });
  }

  let desktop: Sandbox | undefined;
  let activeSandboxId = sandboxId;
  let vncUrl: string | undefined;

  try {
    if (
      activeSandboxId &&
      !(await getSandboxForUser(db, user.id, activeSandboxId))
    ) {
      return new Response("Sandbox not found", { status: 403 });
    }

    if (!activeSandboxId) {
      const newSandbox = await Sandbox.create({
        resolution,
        dpi: 96,
        timeoutMs: getSandboxProviderTimeoutMs(SANDBOX_TIMEOUT_MS),
      });

      await newSandbox.stream.start();

      activeSandboxId = newSandbox.sandboxId;
      vncUrl = withScaledStreamResize(
        newSandbox.stream.getUrl({ resize: "scale" })
      );
      desktop = newSandbox;
      await createSandboxRecord(db, {
        userId: user.id,
        sandboxId: activeSandboxId,
        vncUrl,
        timeoutMs: SANDBOX_TIMEOUT_MS,
        expiresAt: new Date(Date.now() + SANDBOX_TIMEOUT_MS),
      });
    } else {
      desktop = await Sandbox.connect(activeSandboxId);
      await touchSandboxForUser(db, user.id, activeSandboxId);
    }

    if (!desktop) {
      return new Response("Failed to connect to sandbox", { status: 500 });
    }

    await desktop.setTimeout(getSandboxProviderTimeoutMs(SANDBOX_TIMEOUT_MS));

    try {
      const streamer: ComputerInteractionStreamerFacade =
        new OpenAIComputerStreamer(desktop, resolution);

      if (!sandboxId && activeSandboxId && vncUrl) {
        async function* stream(): AsyncGenerator<SSEEvent> {
          yield {
            type: SSEEventType.SANDBOX_CREATED,
            sandboxId: activeSandboxId,
            vncUrl: vncUrl as string,
          };

          if (bootstrap === "paychex") {
            await preparePaychexSandbox(desktop as Sandbox, PAYCHEX_LOGIN_URL);
          }
          yield* streamer.stream({ messages, signal });
        }

        return createStreamingResponse(stream());
      } else {
        return createStreamingResponse(streamer.stream({ messages, signal }));
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
