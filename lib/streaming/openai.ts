import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent, sleep } from "@/types/api";
import {
  ResponseComputerToolCall,
  ResponseInput,
  Tool,
} from "openai/resources/responses/responses.mjs";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { OPENAI_MODEL } from "../config";
import {
  NormalizedOpenAIComputerCall,
  OpenAIComputerAction,
  OpenAIComputerCall,
  OpenAIComputerCallOutput,
} from "@/types/openai";

const INSTRUCTIONS = `
You are Surf, a helpful assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, and more.

Surf is built by E2B, which provides an open source isolated virtual computer in the cloud made for AI use cases.
This application integrates E2B's desktop sandbox with OpenAI's API to create an AI agent that can perform tasks
on a virtual computer through natural language instructions.

The screenshots that you receive are from a running sandbox instance, allowing you to see and interact with a real
virtual computer environment in real-time.

Since you are operating in a secure, isolated sandbox micro VM, you can execute most commands and operations without
worrying about security concerns. This environment is specifically designed for AI experimentation and task execution.

The sandbox is based on Ubuntu 22.04 and comes with many pre-installed applications including:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities
- File manager (PCManFM)
- Text editor (Gedit)
- Calculator and other basic utilities`;

const TYPE_ACTION_CHUNK_SIZE = 50;
const TYPE_ACTION_DELAY_MS = 25;
const INTERSTITIAL_WAIT_DELAY_MS = 800;
const ASYNC_BATCH_FALLBACK_DELAY_MS = 300;

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

function summarizeAction(action: OpenAIComputerAction) {
  switch (action.type) {
    case "click":
      return {
        type: action.type,
        button: action.button,
        x: action.x,
        y: action.y,
      };
    case "double_click":
      return {
        type: action.type,
        x: action.x,
        y: action.y,
      };
    case "drag":
      return {
        type: action.type,
        path_length: action.path.length,
        start: action.path[0],
        end: action.path[action.path.length - 1],
      };
    case "keypress":
      return {
        type: action.type,
        keys: action.keys,
      };
    case "move":
      return {
        type: action.type,
        x: action.x,
        y: action.y,
      };
    case "scroll":
      return {
        type: action.type,
        scroll_x: action.scroll_x,
        scroll_y: action.scroll_y,
        x: action.x,
        y: action.y,
      };
    case "type":
      return {
        type: action.type,
        text_length: action.text.length,
        text_preview: previewText(action.text, 80),
      };
    case "wait":
      return {
        type: action.type,
      };
    case "screenshot":
      return {
        type: action.type,
      };
  }
}

function getWaitRunLengths(actions: OpenAIComputerAction[]): number[] {
  const runs: number[] = [];
  let currentRunLength = 0;

  for (const action of actions) {
    if (action.type === "wait") {
      currentRunLength += 1;
      continue;
    }

    if (currentRunLength > 0) {
      runs.push(currentRunLength);
      currentRunLength = 0;
    }
  }

  if (currentRunLength > 0) {
    runs.push(currentRunLength);
  }

  return runs;
}

function getTrailingWaitCount(actions: OpenAIComputerAction[]): number {
  let count = 0;

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index]?.type !== "wait") {
      break;
    }

    count += 1;
  }

  return count;
}

function isAsyncKeypress(
  action: Extract<OpenAIComputerAction, { type: "keypress" }>
) {
  const normalizedKeys = action.keys.map((key) => key.toUpperCase());

  return normalizedKeys.some((key) =>
    ["ENTER", "RETURN", "TAB", "ESCAPE"].includes(key)
  );
}

function shouldApplyFallbackDelay(actions: OpenAIComputerAction[]): boolean {
  if (getTrailingWaitCount(actions) > 0) {
    return false;
  }

  return actions.some((action) => {
    switch (action.type) {
      case "click":
      case "double_click":
      case "drag":
      case "scroll":
        return true;
      case "keypress":
        return isAsyncKeypress(action);
      default:
        return false;
    }
  });
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

  private normalizeComputerCall(
    computerCall: OpenAIComputerCall
  ): NormalizedOpenAIComputerCall {
    const actions = Array.isArray(computerCall.actions)
      ? computerCall.actions
      : computerCall.action
        ? [computerCall.action]
        : [];

    return {
      ...computerCall,
      actions,
    };
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

  private async captureBatchScreenshot(context: {
    actions: OpenAIComputerAction[];
    callId: string;
    traceId: string;
    turnIndex: number;
  }): Promise<{
    screenshot: CapturedScreenshot;
    fallbackDelayMs: number;
    captureTiming: "immediately_after_batch" | "after_fallback_delay";
  }> {
    const { actions, callId, traceId, turnIndex } = context;
    const fallbackDelayMs = shouldApplyFallbackDelay(actions)
      ? ASYNC_BATCH_FALLBACK_DELAY_MS
      : 0;

    logDebug("OPENAI_BATCH_SCREENSHOT_DELAY", {
      traceId,
      turnIndex,
      call_id: callId,
      fallback_delay_ms: fallbackDelayMs,
      trailing_wait_count: getTrailingWaitCount(actions),
    });

    if (fallbackDelayMs > 0) {
      await sleep(fallbackDelayMs);
    }

    return {
      screenshot: await this.captureScreenshot(),
      fallbackDelayMs,
      captureTiming:
        fallbackDelayMs > 0 ? "after_fallback_delay" : "immediately_after_batch",
    };
  }

  async executeAction(
    action: OpenAIComputerAction
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    switch (action.type) {
      case "screenshot": {
        break;
      }
      case "double_click": {
        await desktop.doubleClick(action.x, action.y);
        break;
      }
      case "click": {
        if (action.button === "left") {
          await desktop.leftClick(action.x, action.y);
        } else if (action.button === "right") {
          await desktop.rightClick(action.x, action.y);
        } else if (action.button === "wheel") {
          await desktop.middleClick(action.x, action.y);
        }
        break;
      }
      case "type": {
        await desktop.write(action.text, {
          chunkSize: TYPE_ACTION_CHUNK_SIZE,
          delayInMs: TYPE_ACTION_DELAY_MS,
        });
        break;
      }
      case "keypress": {
        await desktop.press(action.keys);
        break;
      }
      case "move": {
        await desktop.moveMouse(action.x, action.y);
        break;
      }
      case "scroll": {
        if (action.scroll_y < 0) {
          await desktop.scroll("up", Math.abs(action.scroll_y));
        } else if (action.scroll_y > 0) {
          await desktop.scroll("down", action.scroll_y);
        }
        break;
      }
      case "wait": {
        await sleep(INTERSTITIAL_WAIT_DELAY_MS);
        break;
      }
      case "drag": {
        const startCoordinate: [number, number] = [
          action.path[0].x,
          action.path[0].y,
        ];
        const endCoordinate: [number, number] = [
          action.path[1].x,
          action.path[1].y,
        ];

        await desktop.drag(startCoordinate, endCoordinate);
        break;
      }
      default: {
        logWarning("Unknown action type:", action);
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent> {
    const { messages, signal } = props;
    const traceId = `openai-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    let turnIndex = 0;

    try {
      // GPT-5.4 GA "computer" tool infers display dimensions from the screenshot
      const computerTool = {
        type: "computer" as const,
      } as unknown as Tool;

      logDebug("OPENAI_COMPUTER_STREAM_START", {
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

      let response = await this.openai.responses.create({
        model: OPENAI_MODEL,
        tools: [computerTool],
        input: [...(messages as ResponseInput)],
        truncation: "auto",
        instructions: this.instructions,
        reasoning: {
          effort: "medium",
        },
      });

      while (true) {
        if (signal.aborted) {
          logDebug("OPENAI_COMPUTER_STREAM_ABORTED", {
            traceId,
            turnIndex,
          });
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        turnIndex += 1;

        const computerCalls = response.output
          .filter(
            (item): item is ResponseComputerToolCall => item.type === "computer_call"
          )
          .map((computerCall) =>
            this.normalizeComputerCall(computerCall as OpenAIComputerCall)
          );

        logDebug("OPENAI_RESPONSE_RECEIVED", {
          traceId,
          turnIndex,
          response_id: response.id,
          output_item_types: response.output.map((item) => item.type),
          computer_call_count: computerCalls.length,
          output_text_preview: response.output_text
            ? previewText(response.output_text)
            : null,
        });

        if (computerCalls.length === 0) {
          logDebug("OPENAI_RESPONSE_FINAL", {
            traceId,
            turnIndex,
            response_id: response.id,
            output_text_preview: response.output_text
              ? previewText(response.output_text)
              : null,
          });
          yield {
            type: SSEEventType.REASONING,
            content: response.output_text,
          };
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        // Emit reasoning before actions
        const reasoningItems = response.output.filter(
          (item) => item.type === "message" && "content" in item
        );

        if (reasoningItems.length > 0 && "content" in reasoningItems[0]) {
          const content = reasoningItems[0].content;

          logDebug("Reasoning content structure:", content);

          yield {
            type: SSEEventType.REASONING,
            content:
              reasoningItems[0].content[0].type === "output_text"
                ? reasoningItems[0].content[0].text
                : JSON.stringify(reasoningItems[0].content),
          };
        }

        // Process all computer calls in this turn (GPT-5.4 supports batched actions)
        const callOutputs: OpenAIComputerCallOutput[] = [];

        for (const [callIndex, computerCall] of computerCalls.entries()) {
          const callId = computerCall.call_id;
          const waitRunLengths = getWaitRunLengths(computerCall.actions);
          const trailingWaitCount = getTrailingWaitCount(computerCall.actions);
          const firstTrailingWaitIndex =
            trailingWaitCount > 0
              ? computerCall.actions.length - trailingWaitCount
              : Number.POSITIVE_INFINITY;

          logDebug("OPENAI_COMPUTER_CALL_BATCH", {
            traceId,
            turnIndex,
            call_index: callIndex,
            call_id: callId,
            action_count: computerCall.actions.length,
            action_types: computerCall.actions.map((action) => action.type),
            wait_action_count: computerCall.actions.filter(
              (action) => action.type === "wait"
            ).length,
            consecutive_wait_runs: waitRunLengths,
            trailing_wait_count: trailingWaitCount,
            actions: computerCall.actions.map((action, actionIndex) => ({
              action_index: actionIndex,
              ...summarizeAction(action),
            })),
          });

          for (const [actionIndex, action] of computerCall.actions.entries()) {
            if (!action) continue;

            const actionStartedAt = Date.now();

            yield {
              type: SSEEventType.ACTION,
              action,
            };

            logDebug("OPENAI_ACTION_EXECUTION_START", {
              traceId,
              turnIndex,
              call_id: callId,
              action_index: actionIndex,
              action: summarizeAction(action),
              implementation_behavior:
                action.type === "wait"
                  ? actionIndex >= firstTrailingWaitIndex
                    ? "deferred_to_settle"
                    : "sleep"
                  : action.type === "screenshot"
                    ? "noop"
                    : "desktop_command",
              trailing_wait_deferred:
                action.type === "wait" && actionIndex >= firstTrailingWaitIndex,
            });

            if (
              action.type === "wait" &&
              actionIndex >= firstTrailingWaitIndex
            ) {
              logDebug("OPENAI_ACTION_EXECUTION_DONE", {
                traceId,
                turnIndex,
                call_id: callId,
                action_index: actionIndex,
                action_type: action.type,
                duration_ms: 0,
              });

              yield {
                type: SSEEventType.ACTION_COMPLETED,
              };

              continue;
            }

            await this.executeAction(action);

            logDebug("OPENAI_ACTION_EXECUTION_DONE", {
              traceId,
              turnIndex,
              call_id: callId,
              action_index: actionIndex,
              action_type: action.type,
              duration_ms: Date.now() - actionStartedAt,
            });

            yield {
              type: SSEEventType.ACTION_COMPLETED,
            };
          }

          const {
            screenshot,
            fallbackDelayMs,
            captureTiming,
          } = await this.captureBatchScreenshot({
            actions: computerCall.actions,
            callId,
            traceId,
            turnIndex,
          });

          logDebug("OPENAI_SCREENSHOT_CAPTURED", {
            traceId,
            turnIndex,
            call_id: callId,
            capture_duration_ms: screenshot.captureDurationMs,
            screenshot_bytes: screenshot.byteLength,
            screenshot_base64_chars: screenshot.base64.length,
            capture_timing: captureTiming,
            fallback_delay_ms: fallbackDelayMs,
          });

          callOutputs.push({
            call_id: callId,
            type: "computer_call_output",
            output: {
              type: "computer_screenshot",
              image_url: `data:image/png;base64,${screenshot.base64}`,
              detail: "original",
            },
          });
        }

        logDebug("OPENAI_COMPUTER_CALL_OUTPUTS_SENT", {
          traceId,
          turnIndex,
          previous_response_id: response.id,
          output_count: callOutputs.length,
          call_ids: callOutputs.map((output) => output.call_id),
        });

        response = await this.openai.responses.create({
          model: OPENAI_MODEL,
          previous_response_id: response.id,
          instructions: this.instructions,
          tools: [computerTool],
          input: callOutputs as unknown as ResponseInput,
          truncation: "auto",
          reasoning: {
            effort: "medium",
          },
        });
      }
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
