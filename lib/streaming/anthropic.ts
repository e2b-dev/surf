import { Sandbox } from "@e2b/desktop";
import Anthropic from "@anthropic-ai/sdk";
import { SSEEventType, SSEEvent, sleep } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";
import { ComputerAction, ToolInput } from "@/types/anthropic";
import { logError } from "../logger";
import { ANTHROPIC_MODEL } from "../config";

const INSTRUCTIONS = `
You are Surf, a helpful assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, and more.

Surf is built by E2B, which provides an open source isolated virtual computer in the cloud made for AI use cases.
This application integrates E2B's desktop sandbox with Anthropic's API to create an AI agent that can perform tasks
on a virtual computer through natural language instructions.

The screenshots that you receive are from a running sandbox instance, allowing you to see and interact with a real
virtual computer environment in real-time.

Since you are operating in a secure, isolated sandbox micro VM, you can execute most commands and operations without
worrying about security concerns. This environment is specifically designed for AI experimentation and task execution.

IMPORTANT NOTES:
1. You automatically receive a screenshot after each action you take. You DO NOT need to request screenshots separately.
2. When a user asks you to run a command in the terminal, ALWAYS press Enter immediately after typing the command.
3. When the user explicitly asks you to press any key (Enter, Tab, Ctrl+C, etc.) in any application or interface,
   you MUST do so immediately.
4. Remember: In terminal environments, commands DO NOT execute until Enter is pressed.
5. When working on complex tasks, continue to completion without stopping to ask for confirmation.
   Break down complex tasks into steps and execute them fully.

Please help the user effectively by observing the current state of the computer and taking appropriate actions.
`;

export class AnthropicComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolution: [number, number];
  private anthropic: Anthropic;

  constructor(desktop: Sandbox, resolution: [number, number]) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    this.desktop = desktop;
    this.resolution = resolution;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.instructions = INSTRUCTIONS;
  }

  async executeAction(
    tool: BetaToolUseBlock & ToolInput
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    if (tool.name === "str_replace_editor") {
      const editorCommand = tool.input;

      switch (editorCommand.command) {
        default: {
        }
      }
      return;
    }

    if (tool.name === "bash") {
      const bashCommand = tool.input;

      switch (bashCommand.command) {
        case "command": {
          desktop.commands.run(bashCommand.command);
          return;
        }

        default: {
        }
      }

      return;
    }

    const action = tool.input;

    switch (action.action) {
      case "screenshot": {
        break;
      }

      case "double_click": {
        const [x, y] = action.coordinate;
        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.doubleClick(x, y);
        break;
      }

      case "triple_click": {
        const [x, y] = action.coordinate;

        await desktop.moveMouse(x, y);
        if (action.text) {
          await desktop.press(action.text);
        }
        await desktop.leftClick();
        await desktop.leftClick();
        await desktop.leftClick();
        break;
      }

      case "left_click": {
        const [x, y] = action.coordinate;

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.leftClick(x, y);
        break;
      }

      case "right_click": {
        const [x, y] = action.coordinate;

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.rightClick(x, y);
        break;
      }

      case "middle_click": {
        const [x, y] = action.coordinate;

        if (action.text) {
          await desktop.moveMouse(x, y);
          await desktop.press(action.text);
        }
        await desktop.middleClick(x, y);
        break;
      }

      case "type": {
        await desktop.write(action.text);
        break;
      }

      case "key": {
        await desktop.press(action.text);
        break;
      }

      case "hold_key": {
        await desktop.press(action.text);
        break;
      }

      case "mouse_move": {
        const [x, y] = action.coordinate;
        await desktop.moveMouse(x, y);
        break;
      }

      case "left_mouse_down": {
        break;
      }

      case "left_mouse_up": {
        break;
      }

      case "left_click_drag": {
        const start = action.start_coordinate;
        const end = action.coordinate;
        await desktop.drag(start, end);
        break;
      }

      case "scroll": {
        const [x, y] = action.coordinate;

        const direction = action.scroll_direction;
        const amount = action.scroll_amount;

        await desktop.moveMouse(x, y);

        if (action.text) {
          await desktop.press(action.text);
        }

        await desktop.scroll(direction === "up" ? "up" : "down", amount);
        break;
      }

      case "wait": {
        await sleep(action.duration * 1000);
        break;
      }

      case "cursor_position": {
        break;
      }

      case "zoom": {
        // zoom action requests a high-res view of a region — no desktop action needed
        break;
      }

      default: {
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"anthropic">> {
    const { messages, signal } = props;

    const anthropicMessages: BetaMessageParam[] = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: [{ type: "text", text: msg.content }],
    }));

    try {
      while (true) {
        if (signal?.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        // SDK types don't yet include computer_20251124 / text_editor_20250728 tool versions
        const response = await (this.anthropic.beta.messages.create as Function)({
          model: ANTHROPIC_MODEL,
          max_tokens: 4096,
          messages: anthropicMessages,
          system: this.instructions,
          tools: [
            {
              type: "computer_20251124",
              name: "computer",
              display_width_px: this.resolution[0],
              display_height_px: this.resolution[1],
            },
            {
              type: "text_editor_20250728",
              name: "str_replace_editor",
            },
            {
              type: "bash_20250124",
              name: "bash",
            },
          ],
          betas: ["computer-use-2025-11-24"],
          thinking: { type: "enabled", budget_tokens: 1024 },
        });

        const toolUseBlocks: BetaToolUseBlock[] = [];
        let reasoningText = "";

        for (const block of response.content) {
          if (block.type === "tool_use") {
            toolUseBlocks.push(block);
          } else if (block.type === "text") {
            reasoningText += block.text;
          } else if (block.type === "thinking" && block.thinking) {
            yield {
              type: SSEEventType.REASONING,
              content: block.thinking,
            };
          }
        }

        if (reasoningText) {
          yield {
            type: SSEEventType.REASONING,
            content: reasoningText,
          };
        }

        if (toolUseBlocks.length === 0) {
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        const assistantMessage: BetaMessageParam = {
          role: "assistant",
          content: response.content,
        };
        anthropicMessages.push(assistantMessage);

        const toolResults: BetaToolResultBlockParam[] = [];

        for await (const toolUse of toolUseBlocks) {
          yield {
            type: SSEEventType.ACTION,
            action: toolUse.input as ComputerAction,
          };

          await this.executeAction(toolUse as BetaToolUseBlock & ToolInput);

          yield {
            type: SSEEventType.ACTION_COMPLETED,
          };

          const screenshotData = await this.desktop.screenshot();
          const screenshotBase64 =
            Buffer.from(screenshotData).toString("base64");

          const toolResultContent: BetaToolResultBlockParam["content"] = [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshotBase64,
              },
            },
          ];

          const toolResult: BetaToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResultContent,
            is_error: false,
          };

          toolResults.push(toolResult);
        }

        if (toolResults.length > 0) {
          const userMessage: BetaMessageParam = {
            role: "user",
            content: toolResults,
          };
          anthropicMessages.push(userMessage);
        }
      }
    } catch (error) {
      logError("ANTHROPIC_STREAMER", error);
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      };
    }
  }
}
