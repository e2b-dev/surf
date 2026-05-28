import assert from "node:assert/strict";
import { test } from "node:test";

import { appendUserMessageForDisplay } from "./chat-messages";
import type { UserChatMessage } from "@/types/chat";

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
