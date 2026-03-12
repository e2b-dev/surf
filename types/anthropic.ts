/**
 * Type definitions for Anthropic-related functionality
 */
import {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";

type Coordinate = [number, number];

interface ComputerActionBase {
  action: string;
}

interface KeyAction extends ComputerActionBase {
  action: "key";
  text: string;
}

interface HoldKeyAction extends ComputerActionBase {
  action: "hold_key";
  text: string;
  duration: number;
}

interface TypeAction extends ComputerActionBase {
  action: "type";
  text: string;
}

interface CursorPositionAction extends ComputerActionBase {
  action: "cursor_position";
}

interface MouseMoveAction extends ComputerActionBase {
  action: "mouse_move";
  coordinate: Coordinate;
}

interface LeftMouseDownAction extends ComputerActionBase {
  action: "left_mouse_down";
}

interface LeftMouseUpAction extends ComputerActionBase {
  action: "left_mouse_up";
}

interface LeftClickAction extends ComputerActionBase {
  action: "left_click";
  coordinate: Coordinate;
  text?: string;
}

interface LeftClickDragAction extends ComputerActionBase {
  action: "left_click_drag";
  start_coordinate: Coordinate;
  coordinate: Coordinate;
}

interface RightClickAction extends ComputerActionBase {
  action: "right_click";
  coordinate: Coordinate;
  text?: string;
}

interface MiddleClickAction extends ComputerActionBase {
  action: "middle_click";
  coordinate: Coordinate;
  text?: string;
}

interface DoubleClickAction extends ComputerActionBase {
  action: "double_click";
  coordinate: Coordinate;
  text?: string;
}

interface TripleClickAction extends ComputerActionBase {
  action: "triple_click";
  coordinate: Coordinate;
  text?: string;
}

interface ScrollAction extends ComputerActionBase {
  action: "scroll";
  coordinate: Coordinate;
  scroll_direction: "up" | "down" | "left" | "right";
  scroll_amount: number;
  text?: string;
}

interface WaitAction extends ComputerActionBase {
  action: "wait";
  duration: number;
}

interface ScreenshotAction extends ComputerActionBase {
  action: "screenshot";
}

interface ZoomAction extends ComputerActionBase {
  action: "zoom";
  region: [number, number, number, number]; // [x1, y1, x2, y2]
}

export type ComputerAction =
  | KeyAction
  | HoldKeyAction
  | TypeAction
  | CursorPositionAction
  | MouseMoveAction
  | LeftMouseDownAction
  | LeftMouseUpAction
  | LeftClickAction
  | LeftClickDragAction
  | RightClickAction
  | MiddleClickAction
  | DoubleClickAction
  | TripleClickAction
  | ScrollAction
  | WaitAction
  | ScreenshotAction
  | ZoomAction;

interface TextEditorCommandBase {
  command: string;
  path: string;
}

interface ViewCommand extends TextEditorCommandBase {
  command: "view";
  view_range?: [number, number];
}

interface CreateCommand extends TextEditorCommandBase {
  command: "create";
  file_text: string;
}

interface StrReplaceCommand extends TextEditorCommandBase {
  command: "str_replace";
  old_str: string;
  new_str?: string;
}

interface InsertCommand extends TextEditorCommandBase {
  command: "insert";
  insert_line: number;
  new_str: string;
}

export type TextEditorCommand =
  | ViewCommand
  | CreateCommand
  | StrReplaceCommand
  | InsertCommand;

export type BashCommand =
  | {
      command: string;
      restart?: never;
    }
  | {
      command?: never;
      restart: true;
    };

export type ToolInput =
  | { name: "computer"; input: ComputerAction }
  | { name: "str_replace_editor"; input: TextEditorCommand }
  | { name: "bash"; input: BashCommand };
