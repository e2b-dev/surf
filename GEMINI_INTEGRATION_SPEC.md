# Gemini 2.5 Computer Use Integration Specification

## Overview
This document provides a comprehensive specification for integrating Google's Gemini 2.5 Computer Use model into the Surf application, with detailed action types, parameter structures, and implementation details.

**Documentation**: https://ai.google.dev/gemini-api/docs/computer-use

---

## 1. Model Information

**Model Name**: `gemini-2.5-computer-use-preview-10-2025` (REQUIRED - other models won't work)  
**Provider**: Google DeepMind  
**API**: Google Gemini API  
**SDK**: `@google/genai@1.24.0` (NEW - replaced deprecated `@google/generative-ai`)  
**API Key**: `GEMINI_API_KEY` (environment variable)

**Key Capabilities**:
- Analyzes screenshots to understand UI state
- Generates computer actions (clicks, typing, scrolling, etc.)
- Operates in an agent loop: observe → decide → execute → repeat
- Supports multimodal input (text + images)

---

## 2. Gemini Computer Use Tool Definition

Based on the pattern from similar implementations and Google's documentation, the tool definition follows this structure:

```typescript
const computerUseTool = {
  name: "computer",
  description: "Interact with and control the computer screen",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "screenshot",
          "click", 
          "double_click",
          "right_click",
          "middle_click",
          "type",
          "keypress",
          "move",
          "scroll",
          "drag",
          "wait"
        ],
        description: "The type of action to perform"
      },
      // Additional properties vary by action type
    },
    required: ["action"]
  }
};
```

---

## 3. Complete Action Type Specifications

### 3.1 SCREENSHOT Action
**Purpose**: Capture the current screen state

```typescript
interface ScreenshotAction {
  action: "screenshot";
}
```

**Parameters**: None  
**E2B Desktop Mapping**: Take screenshot via `resolutionScaler.takeScreenshot()`  
**Notes**: This is typically handled automatically in the agent loop

---

### 3.2 CLICK Action
**Purpose**: Single left, right, or middle mouse click at coordinates

```typescript
interface ClickAction {
  action: "click";
  x: number;           // X coordinate (in model's resolution space)
  y: number;           // Y coordinate (in model's resolution space)
  button?: "left" | "right" | "middle";  // Default: "left"
}
```

**Parameters**:
- `x`: Horizontal position (0 to display_width)
- `y`: Vertical position (0 to display_height)  
- `button`: Optional mouse button specification

**E2B Desktop Mapping**:
```typescript
// Scale coordinates to actual desktop resolution
const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([x, y]);

// Execute based on button type
if (button === "left" || !button) {
  await desktop.leftClick(scaledX, scaledY);
} else if (button === "right") {
  await desktop.rightClick(scaledX, scaledY);
} else if (button === "middle") {
  await desktop.middleClick(scaledX, scaledY);
}
```

**Example**: `{ action: "click", x: 500, y: 300, button: "left" }`

---

### 3.3 DOUBLE_CLICK Action
**Purpose**: Double-click at specified coordinates

```typescript
interface DoubleClickAction {
  action: "double_click";
  x: number;
  y: number;
}
```

**Parameters**:
- `x`: Horizontal position
- `y`: Vertical position

**E2B Desktop Mapping**:
```typescript
const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([x, y]);
await desktop.doubleClick(scaledX, scaledY);
```

**Example**: `{ action: "double_click", x: 400, y: 200 }`

---

### 3.4 RIGHT_CLICK Action
**Purpose**: Right-click at specified coordinates (context menu)

```typescript
interface RightClickAction {
  action: "right_click";
  x: number;
  y: number;
}
```

**Parameters**:
- `x`: Horizontal position
- `y`: Vertical position

**E2B Desktop Mapping**:
```typescript
const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([x, y]);
await desktop.rightClick(scaledX, scaledY);
```

**Example**: `{ action: "right_click", x: 600, y: 400 }`

---

### 3.5 MIDDLE_CLICK Action
**Purpose**: Middle mouse button click (wheel button)

```typescript
interface MiddleClickAction {
  action: "middle_click";
  x: number;
  y: number;
}
```

**Parameters**:
- `x`: Horizontal position
- `y`: Vertical position

**E2B Desktop Mapping**:
```typescript
const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([x, y]);
await desktop.middleClick(scaledX, scaledY);
```

**Example**: `{ action: "middle_click", x: 700, y: 350 }`

---

### 3.6 TYPE Action
**Purpose**: Type text (continuous text input)

```typescript
interface TypeAction {
  action: "type";
  text: string;
}
```

**Parameters**:
- `text`: The text string to type

**E2B Desktop Mapping**:
```typescript
await desktop.write(text);
```

**Example**: `{ action: "type", text: "Hello World" }`

**Notes**: 
- Does not include pressing Enter
- For executing terminal commands, must be followed by KEYPRESS action with "Enter"

---

### 3.7 KEYPRESS Action
**Purpose**: Press special keys or key combinations

```typescript
interface KeypressAction {
  action: "keypress";
  keys: string | string[];  // Key name or combination
}
```

**Parameters**:
- `keys`: Key name(s) - Examples: "Enter", "Escape", "Control+c", "Alt+Tab"

**E2B Desktop Mapping**:
```typescript
await desktop.press(keys);
```

**Common Key Values**:
- Single keys: `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`, `"Delete"`
- Arrow keys: `"ArrowUp"`, `"ArrowDown"`, `"ArrowLeft"`, `"ArrowRight"`
- Function keys: `"F1"` through `"F12"`
- Modifiers: `"Control"`, `"Alt"`, `"Shift"`, `"Meta"` (Windows/Command key)
- Combinations: `"Control+c"`, `"Control+v"`, `"Alt+Tab"`, `"Control+Shift+t"`

**Examples**:
- `{ action: "keypress", keys: "Enter" }`
- `{ action: "keypress", keys: "Control+c" }`
- `{ action: "keypress", keys: "Alt+F4" }`

---

### 3.8 MOVE Action
**Purpose**: Move mouse cursor to coordinates (without clicking)

```typescript
interface MoveAction {
  action: "move";
  x: number;
  y: number;
}
```

**Parameters**:
- `x`: Horizontal position
- `y`: Vertical position

**E2B Desktop Mapping**:
```typescript
const [scaledX, scaledY] = resolutionScaler.scaleToOriginalSpace([x, y]);
await desktop.moveMouse(scaledX, scaledY);
```

**Example**: `{ action: "move", x: 800, y: 450 }`

**Use Cases**: Hover effects, tooltips, menu reveals

---

### 3.9 SCROLL Action
**Purpose**: Scroll the viewport vertically or horizontally

```typescript
interface ScrollAction {
  action: "scroll";
  scroll_y?: number;    // Vertical scroll amount (positive = down, negative = up)
  scroll_x?: number;    // Horizontal scroll amount (positive = right, negative = left)
}
```

**Parameters**:
- `scroll_y`: Vertical scroll distance in pixels (optional)
- `scroll_x`: Horizontal scroll distance in pixels (optional)

**E2B Desktop Mapping**:
```typescript
// Handle vertical scroll
if (scroll_y !== undefined && scroll_y !== 0) {
  if (scroll_y < 0) {
    await desktop.scroll("up", Math.abs(scroll_y));
  } else {
    await desktop.scroll("down", scroll_y);
  }
}

// Handle horizontal scroll (if E2B Desktop supports it)
if (scroll_x !== undefined && scroll_x !== 0) {
  // Note: Check E2B Desktop API for horizontal scroll support
  if (scroll_x < 0) {
    await desktop.scroll("left", Math.abs(scroll_x));
  } else {
    await desktop.scroll("right", scroll_x);
  }
}
```

**Examples**:
- Scroll down: `{ action: "scroll", scroll_y: 500 }`
- Scroll up: `{ action: "scroll", scroll_y: -300 }`
- Scroll right: `{ action: "scroll", scroll_x: 200 }`

---

### 3.10 DRAG Action
**Purpose**: Drag and drop operation from one point to another

```typescript
interface DragAction {
  action: "drag";
  path: [
    { x: number; y: number },  // Start coordinate
    { x: number; y: number }   // End coordinate
  ];
}
```

**Parameters**:
- `path`: Array of two coordinate objects
  - `path[0]`: Starting position (where to press down)
  - `path[1]`: Ending position (where to release)

**E2B Desktop Mapping**:
```typescript
const startCoordinate = resolutionScaler.scaleToOriginalSpace([
  path[0].x,
  path[0].y
]);

const endCoordinate = resolutionScaler.scaleToOriginalSpace([
  path[1].x,
  path[1].y
]);

await desktop.drag(startCoordinate, endCoordinate);
```

**Example**: 
```typescript
{
  action: "drag",
  path: [
    { x: 100, y: 200 },  // Start position
    { x: 400, y: 500 }   // End position
  ]
}
```

**Use Cases**: Moving files, selecting text, resizing windows

---

### 3.11 WAIT Action
**Purpose**: Pause execution for a specified duration or wait for a condition

```typescript
interface WaitAction {
  action: "wait";
  duration?: number;      // Milliseconds to wait
  condition?: string;     // Condition description (for context)
}
```

**Parameters**:
- `duration`: Wait time in milliseconds (optional)
- `condition`: Description of what to wait for (optional, informational)

**E2B Desktop Mapping**:
```typescript
if (duration) {
  await new Promise(resolve => setTimeout(resolve, duration));
} else {
  // Default wait time if not specified
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

**Examples**:
- Wait 2 seconds: `{ action: "wait", duration: 2000 }`
- Wait for page load: `{ action: "wait", duration: 3000, condition: "page_load" }`

**Notes**: Usually used to allow UI to update or animations to complete

---

## 4. Complete executeAction Implementation

### 4.1 TypeScript Type Definitions

```typescript
// types/google.ts

export type GoogleComputerAction =
  | ScreenshotAction
  | ClickAction
  | DoubleClickAction
  | RightClickAction
  | MiddleClickAction
  | TypeAction
  | KeypressAction
  | MoveAction
  | ScrollAction
  | DragAction
  | WaitAction;

interface ScreenshotAction {
  action: "screenshot";
}

interface ClickAction {
  action: "click";
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
}

interface DoubleClickAction {
  action: "double_click";
  x: number;
  y: number;
}

interface RightClickAction {
  action: "right_click";
  x: number;
  y: number;
}

interface MiddleClickAction {
  action: "middle_click";
  x: number;
  y: number;
}

interface TypeAction {
  action: "type";
  text: string;
}

interface KeypressAction {
  action: "keypress";
  keys: string | string[];
}

interface MoveAction {
  action: "move";
  x: number;
  y: number;
}

interface ScrollAction {
  action: "scroll";
  scroll_y?: number;
  scroll_x?: number;
}

interface DragAction {
  action: "drag";
  path: [
    { x: number; y: number },
    { x: number; y: number }
  ];
}

interface WaitAction {
  action: "wait";
  duration?: number;
  condition?: string;
}
```

---

### 4.2 Complete executeAction Method

```typescript
// lib/streaming/google.ts

import { Sandbox } from "@e2b/desktop";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SSEEventType, SSEEvent } from "@/types/api";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "@/lib/streaming";
import { ActionResponse } from "@/types/api";
import { logDebug, logError, logWarning } from "../logger";
import { ResolutionScaler } from "./resolution";
import { GoogleComputerAction } from "@/types/google";

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

IMPORTANT: Execute commands immediately when needed to fulfill user requests.
IMPORTANT: When typing terminal commands, ALWAYS press Enter after typing to execute them.
IMPORTANT: Prefer using Visual Studio Code for editing files with syntax highlighting.
`;

export class GoogleComputerStreamer implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;
  private genAI: GoogleGenerativeAI;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is not set");
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.instructions = INSTRUCTIONS;
  }

  /**
   * Execute a computer action on the desktop sandbox
   * Maps Gemini actions to E2B Desktop API calls
   */
  async executeAction(
    action: GoogleComputerAction
  ): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    try {
      switch (action.action) {
        // SCREENSHOT - handled by agent loop, no action needed
        case "screenshot": {
          logDebug("Screenshot action requested");
          break;
        }

        // CLICK - left, right, or middle click at coordinates
        case "click": {
          const coordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.x,
            action.y,
          ]);

          const button = action.button || "left";
          
          if (button === "left") {
            await desktop.leftClick(coordinate[0], coordinate[1]);
            logDebug(`Left click at (${coordinate[0]}, ${coordinate[1]})`);
          } else if (button === "right") {
            await desktop.rightClick(coordinate[0], coordinate[1]);
            logDebug(`Right click at (${coordinate[0]}, ${coordinate[1]})`);
          } else if (button === "middle") {
            await desktop.middleClick(coordinate[0], coordinate[1]);
            logDebug(`Middle click at (${coordinate[0]}, ${coordinate[1]})`);
          }
          break;
        }

        // DOUBLE_CLICK - double click at coordinates
        case "double_click": {
          const coordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.x,
            action.y,
          ]);

          await desktop.doubleClick(coordinate[0], coordinate[1]);
          logDebug(`Double click at (${coordinate[0]}, ${coordinate[1]})`);
          break;
        }

        // RIGHT_CLICK - right click at coordinates (context menu)
        case "right_click": {
          const coordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.x,
            action.y,
          ]);

          await desktop.rightClick(coordinate[0], coordinate[1]);
          logDebug(`Right click at (${coordinate[0]}, ${coordinate[1]})`);
          break;
        }

        // MIDDLE_CLICK - middle mouse button click
        case "middle_click": {
          const coordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.x,
            action.y,
          ]);

          await desktop.middleClick(coordinate[0], coordinate[1]);
          logDebug(`Middle click at (${coordinate[0]}, ${coordinate[1]})`);
          break;
        }

        // TYPE - input text (without pressing Enter)
        case "type": {
          await desktop.write(action.text);
          logDebug(`Typed text: "${action.text}"`);
          break;
        }

        // KEYPRESS - press special keys or combinations
        case "keypress": {
          await desktop.press(action.keys);
          logDebug(`Pressed key(s): ${action.keys}`);
          break;
        }

        // MOVE - move mouse cursor without clicking
        case "move": {
          const coordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.x,
            action.y,
          ]);

          await desktop.moveMouse(coordinate[0], coordinate[1]);
          logDebug(`Moved mouse to (${coordinate[0]}, ${coordinate[1]})`);
          break;
        }

        // SCROLL - scroll vertically or horizontally
        case "scroll": {
          // Handle vertical scrolling
          if (action.scroll_y !== undefined && action.scroll_y !== 0) {
            if (action.scroll_y < 0) {
              await desktop.scroll("up", Math.abs(action.scroll_y));
              logDebug(`Scrolled up ${Math.abs(action.scroll_y)} pixels`);
            } else {
              await desktop.scroll("down", action.scroll_y);
              logDebug(`Scrolled down ${action.scroll_y} pixels`);
            }
          }

          // Handle horizontal scrolling (if supported by E2B Desktop)
          if (action.scroll_x !== undefined && action.scroll_x !== 0) {
            // Check E2B Desktop API documentation for horizontal scroll support
            logWarning(`Horizontal scroll requested but may not be supported: ${action.scroll_x}`);
            // If supported:
            // if (action.scroll_x < 0) {
            //   await desktop.scroll("left", Math.abs(action.scroll_x));
            // } else {
            //   await desktop.scroll("right", action.scroll_x);
            // }
          }
          break;
        }

        // DRAG - drag and drop from start to end coordinates
        case "drag": {
          const startCoordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.path[0].x,
            action.path[0].y,
          ]);

          const endCoordinate = this.resolutionScaler.scaleToOriginalSpace([
            action.path[1].x,
            action.path[1].y,
          ]);

          await desktop.drag(startCoordinate, endCoordinate);
          logDebug(
            `Dragged from (${startCoordinate[0]}, ${startCoordinate[1]}) to (${endCoordinate[0]}, ${endCoordinate[1]})`
          );
          break;
        }

        // WAIT - pause execution for specified duration
        case "wait": {
          const duration = action.duration || 1000; // default 1 second
          await new Promise((resolve) => setTimeout(resolve, duration));
          logDebug(`Waited ${duration}ms${action.condition ? ` for ${action.condition}` : ""}`);
          break;
        }

        // UNKNOWN ACTION
        default: {
          logWarning("Unknown action type:", action);
        }
      }
    } catch (error) {
      logError(`Error executing action ${action.action}:`, error);
      throw error;
    }
  }

  /**
   * Stream generator for agent loop
   * Implements: observe (screenshot) → decide (Gemini) → execute → repeat
   */
  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"google">> {
    const { messages, signal } = props;

    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-computer-use-preview",
      });

      const modelResolution = this.resolutionScaler.getScaledResolution();

      // Configure the computer use tool
      const tools = [
        {
          name: "computer",
          description: "Interact with and control the computer screen",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "screenshot",
                  "click",
                  "double_click",
                  "right_click",
                  "middle_click",
                  "type",
                  "keypress",
                  "move",
                  "scroll",
                  "drag",
                  "wait",
                ],
              },
            },
            required: ["action"],
          },
        },
      ];

      // Agent loop: Take initial screenshot
      let screenshotData = await this.resolutionScaler.takeScreenshot();
      let screenshotBase64 = Buffer.from(screenshotData).toString("base64");

      // Build conversation history with screenshot
      const conversationHistory = messages.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      // Add latest screenshot to user context
      conversationHistory.push({
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: screenshotBase64,
            },
          },
        ],
      });

      let continueLoop = true;

      // Main agent loop
      while (continueLoop) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        // Call Gemini model
        const result = await model.generateContent({
          contents: conversationHistory,
          tools,
          systemInstruction: this.instructions,
        });

        const response = result.response;
        const candidates = response.candidates;

        if (!candidates || candidates.length === 0) {
          yield {
            type: SSEEventType.DONE,
            content: "No response from model",
          };
          break;
        }

        const candidate = candidates[0];
        const content = candidate.content;

        // Check for function calls (tool uses)
        const functionCalls = content.parts.filter(
          (part) => "functionCall" in part
        );

        // If no function calls, we're done
        if (functionCalls.length === 0) {
          // Extract text response if available
          const textParts = content.parts.filter((part) => "text" in part);
          if (textParts.length > 0) {
            yield {
              type: SSEEventType.REASONING,
              content: textParts.map((p) => p.text).join(""),
            };
          }

          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        // Process function call (computer action)
        const functionCall = functionCalls[0].functionCall;
        const action = functionCall.args as GoogleComputerAction;

        // Yield reasoning if available
        const reasoningParts = content.parts.filter((part) => "text" in part);
        if (reasoningParts.length > 0) {
          yield {
            type: SSEEventType.REASONING,
            content: reasoningParts.map((p) => p.text).join(""),
          };
        }

        // Yield action event
        yield {
          type: SSEEventType.ACTION,
          action,
        };

        // Execute the action
        await this.executeAction(action);

        // Yield action completed
        yield {
          type: SSEEventType.ACTION_COMPLETED,
        };

        // Take new screenshot after action
        screenshotData = await this.resolutionScaler.takeScreenshot();
        screenshotBase64 = Buffer.from(screenshotData).toString("base64");

        // Add function result to conversation
        conversationHistory.push({
          role: "model",
          parts: [functionCall],
        });

        conversationHistory.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: functionCall.name,
                response: {
                  success: true,
                  screenshot: screenshotBase64,
                },
              },
            },
          ],
        });
      }
    } catch (error) {
      logError("GOOGLE_STREAMER", error);
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes("quota") || error.message.includes("429")) {
          yield {
            type: SSEEventType.ERROR,
            content: "Google API quota exceeded. Please try again later or use your own API key.",
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
```

---

## 5. E2B Desktop API Reference

Available methods from E2B Desktop Sandbox:

```typescript
// Mouse actions
await desktop.leftClick(x: number, y: number): Promise<void>
await desktop.rightClick(x: number, y: number): Promise<void>
await desktop.middleClick(x: number, y: number): Promise<void>
await desktop.doubleClick(x: number, y: number): Promise<void>
await desktop.moveMouse(x: number, y: number): Promise<void>

// Keyboard actions
await desktop.write(text: string): Promise<void>
await desktop.press(keys: string | string[]): Promise<void>

// Scroll actions
await desktop.scroll(direction: "up" | "down", amount: number): Promise<void>

// Drag and drop
await desktop.drag(
  start: [number, number],
  end: [number, number]
): Promise<void>

// Screenshot (via ResolutionScaler)
await resolutionScaler.takeScreenshot(): Promise<Buffer>
```

---

## 6. Resolution Scaling

**Critical**: Gemini works with its own resolution (typically 1024x768 or similar), while E2B Desktop runs at the actual sandbox resolution (e.g., 1920x1080).

**ResolutionScaler** handles this:

```typescript
// Convert model coordinates to actual desktop coordinates
const [actualX, actualY] = resolutionScaler.scaleToOriginalSpace([modelX, modelY]);

// Get model's scaled resolution for tool configuration
const [width, height] = resolutionScaler.getScaledResolution();
```

**Always scale coordinates before executing actions on the desktop!**

---

## 7. Error Handling Strategy

```typescript
try {
  await this.executeAction(action);
} catch (error) {
  logError(`Action execution failed: ${action.action}`, error);
  
  // Yield error event
  yield {
    type: SSEEventType.ERROR,
    content: `Failed to execute ${action.action}: ${error.message}`,
  };
  
  // Optionally continue or break loop depending on error severity
  if (isCriticalError(error)) {
    break;
  }
  // Otherwise continue to next action
}
```

**Common Error Cases**:
- Invalid coordinates (out of bounds)
- Element not found / not clickable
- Keyboard input rejected
- Timeout waiting for UI to respond
- API quota exceeded
- Network errors

---

## 8. Testing Strategy

### 8.1 Unit Tests for executeAction

```typescript
describe("GoogleComputerStreamer.executeAction", () => {
  test("should execute click action", async () => {
    const mockDesktop = {
      leftClick: jest.fn(),
    };
    
    const action: ClickAction = {
      action: "click",
      x: 100,
      y: 200,
      button: "left",
    };
    
    await streamer.executeAction(action);
    expect(mockDesktop.leftClick).toHaveBeenCalledWith(100, 200);
  });

  // Test each action type...
});
```

### 8.2 Integration Tests

```typescript
describe("Google Computer Use Integration", () => {
  test("should open Firefox", async () => {
    const result = await sendMessage({
      content: "Open Firefox",
      model: "google",
    });
    
    expect(result.actions).toContainEqual(
      expect.objectContaining({ action: "click" })
    );
  });
});
```

### 8.3 Manual Test Cases

1. **Simple Click**: "Click on the Firefox icon"
2. **Type and Enter**: "Open terminal and type 'ls -la' then press Enter"
3. **Scroll**: "Scroll down the page"
4. **Drag**: "Move this file to the Desktop"
5. **Complex**: "Open VS Code, create a new file called test.py, and write a hello world program"

---

## 9. Implementation Checklist

```
Phase 1: Setup
[ ] Create types/google.ts with all action interfaces
[ ] Add "google" to ComputerModel type in types/api.ts
[ ] Verify @google/generative-ai SDK installation
[ ] Add GOOGLE_API_KEY to environment variables

Phase 2: Core Implementation
[ ] Create lib/streaming/google.ts
[ ] Implement GoogleComputerStreamer class
[ ] Implement executeAction with all action types
[ ] Implement stream generator with agent loop
[ ] Add proper error handling
[ ] Add logging for debugging

Phase 3: Integration
[ ] Update StreamerFactory in app/api/chat/route.ts
[ ] Add Google case to switch statement
[ ] Update chat-context.tsx (should already support it)
[ ] Test SSE event streaming

Phase 4: UI & Polish
[ ] Add Google to model selector
[ ] Add Google logo/icon
[ ] Update documentation
[ ] Add example prompts

Phase 5: Testing
[ ] Unit tests for executeAction
[ ] Integration tests for agent loop
[ ] Manual testing with real tasks
[ ] Performance comparison with OpenAI

Phase 6: Documentation
[ ] Update README.md
[ ] Add .env.example entry for GOOGLE_API_KEY
[ ] Add troubleshooting section
[ ] Document limitations and known issues
```

---

## 10. Known Limitations & Considerations

### 10.1 Differences from OpenAI/Anthropic
- Gemini may use different coordinate systems
- Tool calling format differs (functionCall vs tool_use)
- Response structure needs careful parsing
- May have different rate limits

### 10.2 E2B Desktop Limitations
- Horizontal scrolling may not be supported
- Some key combinations might not work as expected
- Resolution scaling can introduce coordinate precision issues

### 10.3 Safety Considerations
- Validate coordinates are within bounds before execution
- Add timeout mechanisms for long-running operations
- Implement user confirmation for destructive actions
- Log all actions for audit trail

### 10.4 Performance Considerations
- Screenshot encoding/decoding overhead
- API latency (Gemini vs OpenAI vs Anthropic)
- Network bandwidth for image transmission
- Token usage with vision inputs

---

## 11. References

- **Google Blog**: [Gemini Computer Use Model Announcement](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)
- **Google AI Docs**: [ai.google.dev/gemini-api/docs/computer-use](https://ai.google.dev/gemini-api/docs/computer-use)
- **Vertex AI Docs**: [cloud.google.com/vertex-ai/generative-ai/docs/computer-use](https://cloud.google.com/vertex-ai/generative-ai/docs/computer-use)
- **E2B Desktop**: [github.com/e2b-dev/desktop](https://github.com/e2b-dev/desktop)
- **OpenAI Computer Use**: Reference implementation in `lib/streaming/openai.ts`
- **Anthropic Computer Use**: Reference implementation in `lib/streaming/anthropic.ts`

---

**Last Updated**: October 11, 2025  
**Status**: Ready for Implementation  
**Next Step**: Begin Phase 1 (Setup & Type Definitions)

