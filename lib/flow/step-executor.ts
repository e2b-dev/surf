/**
 * Step Executor - executes a single flow step on a sandbox using Claude
 */
import Anthropic from "@anthropic-ai/sdk";
import { Sandbox } from "@e2b/desktop";
import {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";
import { RecordingSandbox } from "./sandbox-wrapper";
import { FlowStep, FlowSSEEvent, FlowSSEEventType } from "@/types/flow";
import { ResolutionScaler } from "../streaming/resolution";
import { logDebug, logError, logWarning } from "../logger";
import { ComputerAction, ToolInput } from "@/types/anthropic";

const STEP_INSTRUCTIONS = `
You are an AI assistant executing a specific task on a computer.
Follow the instructions exactly as given and complete the task step by step.

The sandbox is based on Ubuntu 22.04 and comes with pre-installed applications including:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities

IMPORTANT NOTES:
1. You automatically receive a screenshot after each action you take.
2. When typing commands in the terminal, ALWAYS press Enter immediately after typing the command.
3. Take your time with each action. Wait for the UI to respond before proceeding.
4. When you have completed the task or cannot proceed further, stop taking actions.
5. Break down complex tasks into steps and execute them fully.
`;

export interface StepExecutionEvent {
  type: "action" | "reasoning" | "screenshot" | "done" | "error";
  permutationId: string;
  stepId: string;
  data?: unknown;
}

/**
 * FlowStepExecutor executes a single step using Claude's computer-use
 */
export class FlowStepExecutor {
  private anthropic: Anthropic;
  private recordingSandbox: RecordingSandbox;
  private resolutionScaler: ResolutionScaler;
  private permutationId: string;

  constructor(
    recordingSandbox: RecordingSandbox,
    resolution: [number, number],
    permutationId: string
  ) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    this.recordingSandbox = recordingSandbox;
    this.permutationId = permutationId;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.resolutionScaler = new ResolutionScaler(
      recordingSandbox.getSandbox(),
      resolution
    );
  }

  /**
   * Execute a step and yield events
   */
  async *executeStep(
    step: FlowStep,
    signal: AbortSignal
  ): AsyncGenerator<FlowSSEEvent> {
    // Set the current step in recorder
    this.recordingSandbox.recorder.setCurrentStep(step);

    // Yield step started event
    yield {
      type: FlowSSEEventType.STEP_STARTED,
      permutationId: this.permutationId,
      stepId: step.id,
      stepName: step.name,
      stepIndex: 0, // Will be set by caller
      totalSteps: 0, // Will be set by caller
    };

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Take initial screenshot
      const initialScreenshot = await this.resolutionScaler.takeScreenshot();
      const initialScreenshotBase64 =
        Buffer.from(initialScreenshot).toString("base64");

      this.recordingSandbox.recorder.captureScreenshot(initialScreenshotBase64);

      // Create initial messages with step prompt and screenshot
      const messages: BetaMessageParam[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: step.prompt,
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: initialScreenshotBase64,
              },
            },
          ],
        },
      ];

      let maxIterations = 50; // Prevent infinite loops
      let iterations = 0;

      while (iterations < maxIterations) {
        iterations++;

        if (signal.aborted) {
          yield {
            type: FlowSSEEventType.ERROR,
            permutationId: this.permutationId,
            error: "Step execution aborted by user",
          };
          return;
        }

        // Call Claude API
        const response = await this.anthropic.beta.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages,
          system: STEP_INSTRUCTIONS,
          tools: [
            {
              type: "computer_20250124",
              name: "computer",
              display_width_px: modelResolution[0],
              display_height_px: modelResolution[1],
            },
            {
              type: "bash_20250124",
              name: "bash",
            },
          ],
          betas: ["computer-use-2025-01-24"],
        });

        // Process response
        const toolUseBlocks: BetaToolUseBlock[] = [];
        let reasoningText = "";

        for (const block of response.content) {
          if (block.type === "tool_use") {
            toolUseBlocks.push(block);
          } else if (block.type === "text") {
            reasoningText += block.text;
          } else if (block.type === "thinking" && "thinking" in block) {
            yield {
              type: FlowSSEEventType.REASONING,
              permutationId: this.permutationId,
              content: (block as { thinking: string }).thinking,
            };
            this.recordingSandbox.recordReasoning(
              (block as { thinking: string }).thinking
            );
          }
        }

        // Yield reasoning if present
        if (reasoningText) {
          yield {
            type: FlowSSEEventType.REASONING,
            permutationId: this.permutationId,
            content: reasoningText,
          };
          this.recordingSandbox.recordReasoning(reasoningText);
        }

        // No more tool calls - step is done
        if (toolUseBlocks.length === 0) {
          return;
        }

        // Add assistant message to history
        const assistantMessage: BetaMessageParam = {
          role: "assistant",
          content: response.content,
        };
        messages.push(assistantMessage);

        // Execute each tool call
        const toolResults: BetaToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const action = toolUse.input as ComputerAction;

          // Yield action event
          yield {
            type: FlowSSEEventType.ACTION,
            permutationId: this.permutationId,
            action,
          };

          // Execute the action
          await this.executeAction(toolUse as BetaToolUseBlock & ToolInput);

          // Take screenshot after action
          const newScreenshotData = await this.resolutionScaler.takeScreenshot();
          const newScreenshotBase64 =
            Buffer.from(newScreenshotData).toString("base64");

          // Record the frame
          this.recordingSandbox.recorder.captureFrame({
            screenshot: newScreenshotBase64,
            action,
          });

          // Yield screenshot event
          yield {
            type: FlowSSEEventType.SCREENSHOT,
            permutationId: this.permutationId,
            screenshot: newScreenshotBase64,
          };

          // Create tool result with screenshot
          const toolResult: BetaToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: newScreenshotBase64,
                },
              },
            ],
            is_error: false,
          };

          toolResults.push(toolResult);
        }

        // Add tool results as user message
        if (toolResults.length > 0) {
          const userMessage: BetaMessageParam = {
            role: "user",
            content: toolResults,
          };
          messages.push(userMessage);
        }
      }

      // Max iterations reached
      yield {
        type: FlowSSEEventType.ERROR,
        permutationId: this.permutationId,
        error: "Step execution exceeded maximum iterations",
      };
    } catch (error) {
      logError("StepExecutor", error);
      yield {
        type: FlowSSEEventType.ERROR,
        permutationId: this.permutationId,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during step execution",
      };
    }
  }

  /**
   * Execute a tool action on the sandbox
   */
  private async executeAction(
    tool: BetaToolUseBlock & ToolInput
  ): Promise<void> {
    const desktop = this.recordingSandbox.getSandbox();

    // Handle bash commands
    if (tool.name === "bash") {
      const bashCommand = tool.input as { command?: string; restart?: boolean };
      if (bashCommand.command) {
        await desktop.commands.run(bashCommand.command);
      }
      return;
    }

    // Handle computer actions
    const action = tool.input as ComputerAction;

    switch (action.action) {
      case "screenshot": {
        // No-op, screenshot taken after
        break;
      }

      case "double_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.doubleClick(x, y);
        break;
      }

      case "triple_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.leftClick(x, y);
        await desktop.leftClick(x, y);
        await desktop.leftClick(x, y);
        break;
      }

      case "left_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.leftClick(x, y);
        break;
      }

      case "right_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.rightClick(x, y);
        break;
      }

      case "middle_click": {
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
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
        const [x, y] = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.moveMouse(x, y);
        break;
      }

      case "left_click_drag": {
        const start = this.resolutionScaler.scaleToOriginalSpace(
          action.start_coordinate
        );
        const end = this.resolutionScaler.scaleToOriginalSpace(
          action.coordinate
        );
        await desktop.drag(start, end);
        break;
      }

      case "scroll": {
        const direction = action.scroll_direction;
        const amount = action.scroll_amount;
        await desktop.scroll(direction === "up" ? "up" : "down", amount);
        break;
      }

      case "wait": {
        await new Promise((resolve) =>
          setTimeout(resolve, action.duration * 1000)
        );
        break;
      }

      case "cursor_position": {
        // No-op
        break;
      }

      default: {
        logWarning("StepExecutor", "Unknown action type:", action);
      }
    }
  }
}
