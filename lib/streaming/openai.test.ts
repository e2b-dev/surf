import assert from "node:assert/strict";
import { test } from "node:test";

import { buildScreenshotChatInput } from "./openai";

test("screenshot chat input includes the latest user prompt and current UI screenshot", () => {
  const input = buildScreenshotChatInput(
    [
      { role: "user", content: "Can you help me export documents?" },
      { role: "assistant", content: "Open the reports area first." },
      { role: "user", content: "What do I do now?" },
    ],
    "abc123"
  );

  assert.deepEqual(input, [
    { role: "user", content: "Can you help me export documents?" },
    { role: "assistant", content: "Open the reports area first." },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "What do I do now?",
        },
        {
          type: "input_image",
          image_url: "data:image/png;base64,abc123",
          detail: "high",
        },
      ],
    },
  ]);
});
