import type {
  ActionChatMessage,
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
} from "@/types/chat";

export function appendUserMessageForDisplay(
  messages: ChatMessage[],
  userMessage: UserChatMessage,
  hidden?: boolean
): ChatMessage[] {
  if (hidden) {
    return messages;
  }

  return [...messages, userMessage];
}

export function appendActionMessageForDisplay(
  messages: ChatMessage[],
  _actionMessage: ActionChatMessage
): ChatMessage[] {
  return messages;
}

export function appendSystemMessageForDisplay(
  messages: ChatMessage[],
  systemMessage: SystemChatMessage
): ChatMessage[] {
  if (!systemMessage.isError) {
    return messages;
  }

  return [...messages, systemMessage];
}
