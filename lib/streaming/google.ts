import { Sandbox } from "@e2b/desktop";
import {
  GoogleGenAI,
  Environment,
  ContentListUnion,
  GenerateContentConfig,
} from "@google/genai";
import { SSEEventType, SSEEvent } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { ResolutionScaler } from "./resolution";
import {
  GeminiComputerAction,
  denormalizeX,
  denormalizeY,
} from "@/types/google";

const INSTRUCTIONS = `
You are Surf, a helpful AI assistant powered by Google's Gemini 2.5 Computer Use model.
You can interact with a virtual desktop environment through natural language instructions.

This application is built by E2B, which provides an isolated virtual computer in the cloud.
The screenshots you receive are from a running Ubuntu 22.04 sandbox with pre-installed applications:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities
- File manager (PCManFM)
- Text editor (Gedit)
- Calculator and other basic utilities

IMPORTANT: Execute commands immediately when needed to fulfill user requests efficiently.
IMPORTANT: When typing terminal commands, use type_text_at with press_enter=true to execute them.
IMPORTANT: Prefer using Visual Studio Code for editing files with syntax highlighting and code completion.
`;

export class GoogleComputerStreamer
  implements ComputerInteractionStreamerFacade
{
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;
  private client: GoogleGenAI;
  private currentUrl: string = "about:blank";

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    this.client = new GoogleGenAI({ apiKey });
    this.instructions = INSTRUCTIONS;
  }

  /**
   * Get recommended delay in ms for UI to settle after an action
   * Different actions require different wait times for visual updates
   */
  private getActionSettleDelay(action: GeminiComputerAction): number {
    switch (action.name) {
      case "click_at":
      case "hover_at":
        return 400; // clicks/hovers may trigger animations or page loads
      case "type_text_at":
        return action.args.press_enter ? 3000 : action.args.text.length * 50; // entering may trigger navigation
      case "key_combination":
        return 300;
      case "scroll_document":
      case "scroll_at":
        return 200; // scrolling is usually fast
      case "drag_and_drop":
        return 300;
      case "navigate":
        return 800; // page loads take longer
      default:
        return 300; // default conservative delay
    }
  }

  /**
   * Execute a Gemini computer action on the desktop sandbox
   * Maps Gemini actions (with normalized 0-999 coordinates) to E2B Desktop API calls
   */
  async executeAction(
    action: GeminiComputerAction
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;
    const resolution = this.resolutionScaler.getOriginalResolution();

    try {
      switch (action.name) {
        case "open_web_browser": {
          logDebug("open_web_browser - browser already running");
          this.currentUrl = "about:blank";
          break;
        }

        case "wait_5_seconds": {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          logDebug("Waited 5 seconds");
          break;
        }

        case "go_back": {
          logWarning("go_back not supported by E2B Desktop");
          break;
        }

        case "go_forward": {
          logWarning("go_forward not supported by E2B Desktop");
          break;
        }

        case "search": {
          logWarning("search action not supported by E2B Desktop");
          break;
        }

        case "navigate": {
          // track URL for function response
          this.currentUrl = action.args.url;
          logDebug(
            `Navigate to ${action.args.url} - URL tracked but navigation via UI interaction`
          );
          break;
        }

        case "click_at": {
          // denormalize from 0-999 to actual pixels
          const actualX = denormalizeX(action.args.x, resolution[0]);
          const actualY = denormalizeY(action.args.y, resolution[1]);

          await desktop.leftClick(actualX, actualY);
          logDebug(
            `Clicked at (${actualX}, ${actualY}) [normalized: ${action.args.x}, ${action.args.y}]`
          );
          break;
        }

        case "hover_at": {
          const actualX = denormalizeX(action.args.x, resolution[0]);
          const actualY = denormalizeY(action.args.y, resolution[1]);

          await desktop.moveMouse(actualX, actualY);
          logDebug(
            `Hovered at (${actualX}, ${actualY}) [normalized: ${action.args.x}, ${action.args.y}]`
          );
          break;
        }

        case "type_text_at": {
          const actualX = denormalizeX(action.args.x, resolution[0]);
          const actualY = denormalizeY(action.args.y, resolution[1]);

          // click to focus
          await desktop.leftClick(actualX, actualY);

          // clear field if requested (default true)
          if (action.args.clear_before_typing !== false) {
            await desktop.press("Control+a");
            await desktop.press("Backspace");
          }

          // type the text
          await desktop.write(action.args.text);

          // press enter if requested (default true)
          if (action.args.press_enter !== false) {
            await desktop.press("Enter");
          }

          logDebug(
            `Typed "${
              action.args.text
            }" at (${actualX}, ${actualY}), press_enter=${
              action.args.press_enter !== false
            }`
          );
          break;
        }

        case "key_combination": {
          await desktop.press(action.args.keys);
          logDebug(`Pressed key combination: ${action.args.keys}`);
          break;
        }

        case "scroll_document": {
          const direction = action.args.direction;

          if (direction === "up" || direction === "down") {
            await desktop.scroll(direction, 500);
            logDebug(`Scrolled document ${direction}`);
          } else {
            logWarning(`Horizontal scroll (${direction}) not fully supported`);
          }
          break;
        }

        case "scroll_at": {
          const actualX = denormalizeX(action.args.x, resolution[0]);
          const actualY = denormalizeY(action.args.y, resolution[1]);

          // click at position to focus element
          await desktop.leftClick(actualX, actualY);

          const direction = action.args.direction;
          const magnitude = action.args.magnitude || 800;

          // denormalize magnitude from 0-999 to reasonable pixel amount
          const actualMagnitude = Math.round((magnitude / 1000) * 500);

          if (direction === "up" || direction === "down") {
            await desktop.scroll(direction, actualMagnitude);
            logDebug(
              `Scrolled ${direction} at (${actualX}, ${actualY}) by ${actualMagnitude}px`
            );
          } else {
            logWarning(
              `Horizontal scroll at position not fully supported: ${direction}`
            );
          }
          break;
        }

        case "drag_and_drop": {
          const startX = denormalizeX(action.args.x, resolution[0]);
          const startY = denormalizeY(action.args.y, resolution[1]);
          const endX = denormalizeX(action.args.destination_x, resolution[0]);
          const endY = denormalizeY(action.args.destination_y, resolution[1]);

          await desktop.drag([startX, startY], [endX, endY]);
          logDebug(`Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`);
          break;
        }

        default: {
          logWarning("Unknown action:", action);
        }
      }
    } catch (error) {
      logError(`Error executing action ${action.name}:`, error);
      throw error;
    }
  }

  /**
   * Stream generator for agent loop
   * Based on: https://ai.google.dev/gemini-api/docs/computer-use
   */
  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"google">> {
    const { messages, signal } = props;

    try {
      const resolution = this.resolutionScaler.getOriginalResolution();

      // Disable all GeminiComputerAction types not supported by executeAction:
      const excludedPredefinedFunctions = [
        "open_web_browser",
        "wait_5_seconds",
        "go_back",
        "go_forward",
        "search",
        "navigate",
      ];

      // configure computer use tool per documentation
      const config: GenerateContentConfig = {
        tools: [
          {
            computerUse: {
              environment: Environment.ENVIRONMENT_BROWSER,
              excludedPredefinedFunctions,
            },
          },
        ],
        systemInstruction: { parts: [{ text: this.instructions }] },
      };

      // capture initial environment state
      // per docs: send user request + screenshot to start the agent loop
      let screenshotData = await this.resolutionScaler.takeScreenshot();
      let screenshotBase64 = Buffer.from(screenshotData).toString("base64");

      // build conversation contents
      const contents: ContentListUnion = [];

      // add previous messages from chat history
      for (const msg of messages) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }

      // add initial screenshot with latest user message
      // per docs: model needs current screen state to suggest actions
      contents.push({
        role: "user",
        parts: [
          {
            text: `Current screen (resolution: ${resolution[0]}x${resolution[1]}):`,
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: screenshotBase64,
            },
          },
        ],
      });

      let continueLoop = true;
      let iterationCount = 0;
      const MAX_ITERATIONS = 50;

      // main agent loop
      while (continueLoop && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        // call Gemini model
        logDebug(`Gemini iteration ${iterationCount}: calling model...`);
        const response = await this.client.models.generateContent({
          model: "gemini-2.5-computer-use-preview-10-2025",
          contents,
          config,
        });

        if (!response?.candidates || response.candidates.length === 0) {
          yield {
            type: SSEEventType.DONE,
            content: "No response from model",
          };
          break;
        }

        const candidate = response.candidates[0];
        const content = candidate.content;

        if (!content?.parts) {
          yield {
            type: SSEEventType.DONE,
            content: "Empty response from model",
          };
          break;
        }

        // extract text/reasoning if available
        const textParts = content.parts.filter((part: any) => part.text);
        if (textParts.length > 0) {
          const reasoningText = textParts.map((p: any) => p.text).join("");
          if (reasoningText.trim()) {
            yield {
              type: SSEEventType.REASONING,
              content: reasoningText,
            };
          }
        }

        // check for function calls
        const functionCalls = content.parts.filter(
          (part: any) => part.functionCall
        );

        // if no function calls, we're done
        if (functionCalls.length === 0) {
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        // process all function calls
        // per docs: execute action(s), then capture new state (screenshot + URL)
        const executedActions: GeminiComputerAction[] = [];

        for (const part of functionCalls) {
          const functionCall = part.functionCall;

          const name = functionCall?.name;
          const args = functionCall?.args;

          if (!name || !args) {
            logWarning("Function call is undefined");
            continue;
          }

          const action: GeminiComputerAction = {
            name: name,
            args: args,
          } as GeminiComputerAction;

          // yield action event
          yield {
            type: SSEEventType.ACTION,
            action,
          };

          // execute the action
          await this.executeAction(action);
          executedActions.push(action);

          // yield action completed
          yield {
            type: SSEEventType.ACTION_COMPLETED,
          };
        }

        // wait for UI to settle after actions
        // use the longest recommended delay from all executed actions
        if (executedActions.length > 0) {
          const maxDelay = Math.max(
            ...executedActions.map((action) =>
              this.getActionSettleDelay(action)
            )
          );
          await new Promise((resolve) => setTimeout(resolve, maxDelay));
        }

        // capture new environment state: screenshot + URL
        screenshotData = await this.resolutionScaler.takeScreenshot();
        screenshotBase64 = Buffer.from(screenshotData).toString("base64");

        // add model's response to conversation history
        contents.push(content);

        // build function responses with current URL
        // per docs: function response must include URL field
        const functionResponses = functionCalls.map((part: any) => ({
          functionResponse: {
            name: part.functionCall.name,
            response: {
              url: this.currentUrl,
            },
          },
        }));

        // send function response(s) with new screenshot
        // per docs: screenshot shows result of executed action(s)
        contents.push({
          role: "user",
          parts: [
            ...functionResponses,
            {
              inlineData: {
                mimeType: "image/png",
                data: screenshotBase64,
              },
            },
          ],
        });
      }

      // check if we hit iteration limit
      if (iterationCount >= MAX_ITERATIONS) {
        yield {
          type: SSEEventType.ERROR,
          content: "Maximum iteration limit reached. Task may be too complex.",
        };
      }

      yield {
        type: SSEEventType.DONE,
      };
    } catch (error) {
      logError("GOOGLE_STREAMER error:", error);

      // handle specific error types
      if (error instanceof Error) {
        if (
          error.message.includes("quota") ||
          error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED")
        ) {
          yield {
            type: SSEEventType.ERROR,
            content:
              "Gemini API quota exceeded. Please try again later or use your own API key.",
          };
        } else if (
          error.message.includes("API key") ||
          error.message.includes("API_KEY")
        ) {
          yield {
            type: SSEEventType.ERROR,
            content:
              "Invalid Gemini API key. Please check your GEMINI_API_KEY.",
          };
        } else {
          yield {
            type: SSEEventType.ERROR,
            content: `Error: ${error.message}`,
          };
        }
      } else {
        yield {
          type: SSEEventType.ERROR,
          content: "An error occurred with the AI service. Please try again.",
        };
      }

      yield {
        type: SSEEventType.DONE,
      };
    }
  }
}
