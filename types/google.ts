/**
 * Type definitions for Google Gemini Computer Use functionality
 * Based on: https://ai.google.dev/gemini-api/docs/computer-use
 *
 * Note: Gemini uses normalized coordinates (0-999) instead of pixel coordinates
 */

/**
 * Base interface for all Gemini computer actions
 */
interface GeminiActionBase {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Open web browser action
 */
export interface OpenWebBrowserAction extends GeminiActionBase {
  name: "open_web_browser";
  args: Record<string, never>;
}

/**
 * Wait 5 seconds action
 */
export interface Wait5SecondsAction extends GeminiActionBase {
  name: "wait_5_seconds";
  args: Record<string, never>;
}

/**
 * Go back in browser history
 */
export interface GoBackAction extends GeminiActionBase {
  name: "go_back";
  args: Record<string, never>;
}

/**
 * Go forward in browser history
 */
export interface GoForwardAction extends GeminiActionBase {
  name: "go_forward";
  args: Record<string, never>;
}

/**
 * Navigate to search engine homepage
 */
export interface SearchAction extends GeminiActionBase {
  name: "search";
  args: Record<string, never>;
}

/**
 * Navigate to URL
 */
export interface NavigateAction extends GeminiActionBase {
  name: "navigate";
  args: {
    url: string;
  };
}

/**
 * Click at coordinates (normalized 0-999)
 */
export interface ClickAtAction extends GeminiActionBase {
  name: "click_at";
  args: {
    x: number; // 0-999
    y: number; // 0-999
  };
}

/**
 * Hover at coordinates (normalized 0-999)
 */
export interface HoverAtAction extends GeminiActionBase {
  name: "hover_at";
  args: {
    x: number; // 0-999
    y: number; // 0-999
  };
}

/**
 * Type text at coordinates (normalized 0-999)
 */
export interface TypeTextAtAction extends GeminiActionBase {
  name: "type_text_at";
  args: {
    x: number; // 0-999
    y: number; // 0-999
    text: string;
    press_enter?: boolean; // default true
    clear_before_typing?: boolean; // default true
  };
}

/**
 * Press keyboard keys or combinations
 */
export interface KeyCombinationAction extends GeminiActionBase {
  name: "key_combination";
  args: {
    keys: string; // e.g., "enter", "control+c"
  };
}

/**
 * Scroll entire document
 */
export interface ScrollDocumentAction extends GeminiActionBase {
  name: "scroll_document";
  args: {
    direction: "up" | "down" | "left" | "right";
  };
}

/**
 * Scroll at specific coordinates (normalized 0-999)
 */
export interface ScrollAtAction extends GeminiActionBase {
  name: "scroll_at";
  args: {
    x: number; // 0-999
    y: number; // 0-999
    direction: "up" | "down" | "left" | "right";
    magnitude?: number; // 0-999, default 800
  };
}

/**
 * Drag and drop (normalized 0-999)
 */
export interface DragAndDropAction extends GeminiActionBase {
  name: "drag_and_drop";
  args: {
    x: number; // start x (0-999)
    y: number; // start y (0-999)
    destination_x: number; // end x (0-999)
    destination_y: number; // end y (0-999)
  };
}

/**
 * Union type of all possible Gemini computer actions
 */
export type GeminiComputerAction =
  | OpenWebBrowserAction
  | Wait5SecondsAction
  | GoBackAction
  | GoForwardAction
  | SearchAction
  | NavigateAction
  | ClickAtAction
  | HoverAtAction
  | TypeTextAtAction
  | KeyCombinationAction
  | ScrollDocumentAction
  | ScrollAtAction
  | DragAndDropAction;

/**
 * Helper to denormalize coordinates from 0-999 to actual pixels
 */
export function denormalizeX(x: number, screenWidth: number): number {
  return Math.round((x / 1000) * screenWidth);
}

export function denormalizeY(y: number, screenHeight: number): number {
  return Math.round((y / 1000) * screenHeight);
}
