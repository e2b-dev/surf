import assert from "node:assert";
import { Sandbox } from "@e2b/desktop";
import { OpenAIComputerStreamer } from "./openai";

// The streamer constructs the OpenAI SDK (needs a key); redaction makes no
// network calls, so a dummy key is enough to exercise it.
process.env.OPENAI_API_KEY ??= "test-key";

// Minimal stand-in — redaction never touches the sandbox.
const mockSandbox = {} as unknown as Sandbox;

const PASSWORD = "hunter2-secret";

/**
 * Security invariant: any secret the agent types must be masked before the
 * action is emitted to the browser. See getForkDemoConfig / /api/chat.
 */
function runRedactionTests() {
  const streamer = new OpenAIComputerStreamer(mockSandbox, [1024, 768], {
    redactSecrets: [PASSWORD],
  });
  // redactActionForClient is private; exercise it directly.
  const redact = (action: unknown) =>
    (streamer as unknown as {
      redactActionForClient: (a: unknown) => { type: string; text?: string };
    }).redactActionForClient(action);

  // 1. The password typed by the agent is masked.
  const typed = redact({ type: "type", text: `login ${PASSWORD}` });
  assert.ok(
    !typed.text!.includes(PASSWORD),
    `password leaked in type action: ${typed.text}`
  );

  // 2. Non-type actions are untouched.
  const click = { type: "click", button: "left", x: 10, y: 20 };
  assert.deepStrictEqual(redact(click), click, "click action was altered");

  // 3. With no configured secrets, type text passes through unchanged.
  const plain = new OpenAIComputerStreamer(mockSandbox, [1024, 768]);
  const plainTyped = (plain as unknown as {
    redactActionForClient: (a: unknown) => { text?: string };
  }).redactActionForClient({ type: "type", text: "just some text" });
  assert.strictEqual(plainTyped.text, "just some text");

  console.log("✓ redaction masks typed secrets and leaves other output intact");
}

runRedactionTests();
