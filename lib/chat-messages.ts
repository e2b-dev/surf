import type { ChatMessage, UserChatMessage } from "@/types/chat";

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
