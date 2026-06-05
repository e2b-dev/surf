import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent } from "@/types/api";
import { ResponseInput } from "openai/resources/responses/responses.mjs";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { OPENAI_MODEL } from "../config";
import { OpenAIComputerAction } from "@/types/openai";

export const INSTRUCTIONS = `
You are Invoke, a chat-based assistant helping users complete Paychex Flex to ADP migration discovery tasks.

You cannot click, type, scroll, navigate, or otherwise control the browser or virtual desktop. You only receive screenshots of the current UI when the user sends a message.

Use the screenshot and chat history to tell the user what to do next. Give concise, step-by-step guidance for finding and exporting documents or reports. If the current screenshot does not show enough information, ask the user to navigate manually and send another message.

If there is no reports section in the dropdown, reply exactly: "We are missing permisions for this client, they need to enable the reports and analytics section".

Do not claim that you performed actions in the browser. Do not say you clicked, opened, selected, downloaded, or exported anything yourself. Phrase instructions as actions for the user to take.`;

type CapturedScreenshot = {
  base64: string;
  byteLength: number;
  captureDurationMs: number;
};

function previewText(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function buildScreenshotChatInput(
  messages: ComputerInteractionStreamerFacadeStreamProps["messages"],
  screenshotBase64: string
): ResponseInput {
  const previousMessages = messages.slice(0, -1).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const latestMessage = messages.at(-1);

  return [
    ...previousMessages,
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            latestMessage?.content ||
            "Review the current UI and tell me what to do next.",
        },
        {
          type: "input_image",
          image_url: `data:image/png;base64,${screenshotBase64}`,
          detail: "high",
        },
      ],
    },
  ];
}

export class OpenAIComputerStreamer
  implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolution: [number, number];

  private openai: OpenAI;

  constructor(desktop: Sandbox, resolution: [number, number]) {
    this.desktop = desktop;
    this.resolution = resolution;
    this.openai = new OpenAI();
    this.instructions = INSTRUCTIONS;
  }

  private async captureScreenshot(): Promise<CapturedScreenshot> {
    const captureStartedAt = Date.now();
    const screenshotData = Buffer.from(await this.desktop.screenshot());

    return {
      base64: screenshotData.toString("base64"),
      byteLength: screenshotData.length,
      captureDurationMs: Date.now() - captureStartedAt,
    };
  }

  async executeAction(
    action: OpenAIComputerAction
  ): Promise<ActionResponse | void> {
    if (action.type !== "screenshot") {
      logWarning("Ignoring computer action in screenshot-only chat mode:", {
        type: action.type,
      });
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent> {
    const { messages, signal } = props;
    const traceId = `openai-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      logDebug("OPENAI_SCREENSHOT_CHAT_START", {
        traceId,
        model: OPENAI_MODEL,
        resolution: this.resolution,
        message_count: messages.length,
        last_user_message_preview:
          messages
            .filter((message) => message.role === "user")
            .at(-1)
            ?.content.slice(0, 160) ?? null,
      });

      if (signal.aborted) {
        logDebug("OPENAI_SCREENSHOT_CHAT_ABORTED", {
          traceId,
        });
        yield {
          type: SSEEventType.DONE,
          content: "Generation stopped by user",
        };
        return;
      }

      const screenshot = await this.captureScreenshot();

      logDebug("OPENAI_SCREENSHOT_CHAT_CAPTURED", {
        traceId,
        capture_duration_ms: screenshot.captureDurationMs,
        screenshot_bytes: screenshot.byteLength,
        screenshot_base64_chars: screenshot.base64.length,
      });

      const response = await this.openai.responses.create({
        model: OPENAI_MODEL,
        input: buildScreenshotChatInput(messages, screenshot.base64),
        truncation: "auto",
        instructions: this.instructions,
        reasoning: {
          effort: "medium",
        },
      });

      logDebug("OPENAI_SCREENSHOT_CHAT_RESPONSE", {
        traceId,
        response_id: response.id,
        output_item_types: response.output.map((item) => item.type),
        output_text_preview: response.output_text
          ? previewText(response.output_text)
          : null,
      });

      if (!signal.aborted) {
        yield {
          type: SSEEventType.REASONING,
          content: response.output_text,
        };
      }

      yield {
        type: SSEEventType.DONE,
      };
    } catch (error) {
      logError("OPENAI_STREAMER", error);
      if (error instanceof OpenAI.APIError && error.status === 429) {
        yield {
          type: SSEEventType.ERROR,
          content:
            "Our usage quota ran out for this month. Please visit GitHub, self host the repository and use your own API keys to continue.",
        };
        yield {
          type: SSEEventType.DONE,
        };
        return;
      }
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      };
    }
  }
}
