/**
 * Type definitions for chat messages and related functionality
 */
import { ActionEvent, SSEEventType } from "./api";
import { OpenAIComputerAction } from "@/types/openai";

/**
 * Role of a chat message
 */
export type MessageRole = "user" | "assistant" | "system" | "action";

/**
 * Base interface for all chat messages
 */
export interface BaseChatMessage {
  id: string;
  role: MessageRole;
}

/**
 * User message in the chat
 */
export interface UserChatMessage extends BaseChatMessage {
  role: "user";
  content: string;
}

/**
 * Assistant message in the chat
 */
export interface AssistantChatMessage extends BaseChatMessage {
  role: "assistant";
  content: string;
}

/**
 * System message in the chat
 */
export interface SystemChatMessage extends BaseChatMessage {
  role: "system";
  content: string;
  isError?: boolean;
}

/**
 * Action message in the chat
 */
export interface ActionChatMessage extends BaseChatMessage {
  role: "action";
  action: OpenAIComputerAction;
  repeatCount?: number;
  status?: "pending" | "completed" | "failed";
}

/**
 * Union type for all chat messages
 */
export type ChatMessage =
  | UserChatMessage
  | AssistantChatMessage
  | SystemChatMessage
  | ActionChatMessage;

/**
 * Chat state interface
 */
export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Parsed SSE event from the server
 */
export interface ParsedSSEEvent {
  type: SSEEventType;
  content?: any;
  action?: ActionEvent["action"];
  callId?: string;
  sandboxId?: string;
  vncUrl?: string;
}

/**
 * Chat API request parameters
 */
export interface ChatApiRequest {
  messages: { role: MessageRole; content: string }[];
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
}

/**
 * Options for sending a message
 */
export interface SendMessageOptions {
  content: string;
  sandboxId?: string;
  environment?: string;
  resolution: [number, number];
}
