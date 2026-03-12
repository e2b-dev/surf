import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent } from "@/types/api";
import {
  ResponseComputerToolCall,
  ResponseInput,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses.mjs";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { OPENAI_MODEL } from "../config";

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
- Calculator and other basic utilities

IMPORTANT: It is okay to run terminal commands at any point without confirmation, as long as they are required to fulfill the task the user has given. You should execute commands immediately when needed to complete the user's request efficiently.

IMPORTANT: When typing commands in the terminal, ALWAYS send a KEYPRESS ENTER action immediately after typing the command to execute it. Terminal commands will not run until you press Enter.

IMPORTANT: When editing files, prefer to use Visual Studio Code (VS Code) as it provides a better editing experience with syntax highlighting, code completion, and other helpful features.
`;

export class OpenAIComputerStreamer
  implements ComputerInteractionStreamerFacade
{
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

  async executeAction(
    action: ResponseComputerToolCall["action"]
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
        await desktop.write(action.text);
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
  ): AsyncGenerator<SSEEvent<"openai">> {
    const { messages, signal } = props;

    try {
      // GPT-5.4 GA "computer" tool infers display dimensions from the screenshot
      const computerTool = {
        type: "computer" as const,
      } as unknown as Tool;

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
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        const computerCalls = response.output.filter(
          (item) => item.type === "computer_call"
        );

        if (computerCalls.length === 0) {
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
        const callOutputs: ResponseInputItem[] = [];

        for (const computerCall of computerCalls) {
          const callId = computerCall.call_id;

          // GPT-5.4 uses "actions" (array), older models use "action" (single)
          const actions = (computerCall as any).actions ?? [computerCall.action];

          for (const action of actions) {
            if (!action) continue;

            yield {
              type: SSEEventType.ACTION,
              action,
            };

            await this.executeAction(action);

            yield {
              type: SSEEventType.ACTION_COMPLETED,
            };
          }

          const screenshotData = await this.desktop.screenshot();
          const screenshotBase64 =
            Buffer.from(screenshotData).toString("base64");

          callOutputs.push({
            call_id: callId,
            type: "computer_call_output",
            output: {
              type: "computer_screenshot",
              image_url: `data:image/png;base64,${screenshotBase64}`,
            },
          });
        }

        response = await this.openai.responses.create({
          model: OPENAI_MODEL,
          previous_response_id: response.id,
          instructions: this.instructions,
          tools: [computerTool],
          input: callOutputs,
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
