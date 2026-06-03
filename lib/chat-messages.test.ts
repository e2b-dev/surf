import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendActionMessageForDisplay,
  appendSystemMessageForDisplay,
  appendUserMessageForDisplay,
  getVisibleChatMessages,
} from "./chat-messages";
import type {
  ActionChatMessage,
  AssistantChatMessage,
  ChatMessage,
  SystemChatMessage,
  UserChatMessage,
} from "@/types/chat";

test("hidden auto-start prompts are not appended to visible chat", () => {
  const message: UserChatMessage = {
    role: "user",
    id: "paychex-auto-start",
    content: "Start the Paychex Flex to ADP migration discovery flow.",
  };

  assert.deepEqual(appendUserMessageForDisplay([], message, true), []);
});

test("manual user prompts remain visible in chat", () => {
  const message: UserChatMessage = {
    role: "user",
    id: "manual-message",
    content: "Check the current page.",
  };

  assert.deepEqual(appendUserMessageForDisplay([], message, false), [message]);
});

test("computer actions are not appended to visible chat", () => {
  const existingMessage: AssistantChatMessage = {
    role: "assistant",
    id: "assistant-suggestion",
    content: "Review the employee list before exporting it.",
  };
  const actionMessage: ActionChatMessage = {
    role: "action",
    id: "action-click",
    action: {
      type: "click",
      button: "left",
      x: 100,
      y: 200,
    } as ActionChatMessage["action"],
    status: "pending",
  };

  assert.deepEqual(
    appendActionMessageForDisplay([existingMessage], actionMessage),
    [existingMessage]
  );
});

test("non-error system progress messages are not appended to visible chat", () => {
  const existingMessage: AssistantChatMessage = {
    role: "assistant",
    id: "assistant-suggestion",
    content: "Review the employee list before exporting it.",
  };
  const progressMessage: SystemChatMessage = {
    role: "system",
    id: "system-progress",
    content: "Task completed",
  };

  assert.deepEqual(
    appendSystemMessageForDisplay([existingMessage], progressMessage),
    [existingMessage]
  );
});

test("system error messages remain visible in chat", () => {
  const errorMessage: SystemChatMessage = {
    role: "system",
    id: "system-error",
    content: "The model request failed.",
    isError: true,
  };

  assert.deepEqual(appendSystemMessageForDisplay([], errorMessage), [
    errorMessage,
  ]);
});

test("visible chat messages exclude action messages as a display guard", () => {
  const assistantMessage: AssistantChatMessage = {
    role: "assistant",
    id: "assistant-message",
    content: "I found the payroll report.",
  };
  const actionMessage: ActionChatMessage = {
    role: "action",
    id: "action-click",
    action: {
      type: "click",
      button: "left",
      x: 100,
      y: 200,
    } as ActionChatMessage["action"],
  };
  const errorMessage: SystemChatMessage = {
    role: "system",
    id: "system-error",
    content: "The model request failed.",
    isError: true,
  };
  const progressMessage: SystemChatMessage = {
    role: "system",
    id: "system-progress",
    content: "Task completed",
  };
  const messages: ChatMessage[] = [
    assistantMessage,
    actionMessage,
    progressMessage,
    errorMessage,
  ];

  assert.deepEqual(getVisibleChatMessages(messages), [
    assistantMessage,
    errorMessage,
  ]);
});
