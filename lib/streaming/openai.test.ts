import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SSEEventType } from "@/types/api";
import { OpenAIComputerStreamer } from "./openai";

function response(text = "OK") {
  return {
    id: "resp-test",
    output: [
      {
        id: "msg-test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    output_text: text,
  };
}

async function collect(streamer: OpenAIComputerStreamer) {
  const events = [];
  for await (const event of streamer.stream({
    messages: [{ role: "user", content: "hello" }],
    signal: new AbortController().signal,
  })) {
    events.push(event);
  }
  return events;
}

function streamerWith(create: ReturnType<typeof vi.fn>) {
  const client = { responses: { create } } as unknown as OpenAI;
  return new OpenAIComputerStreamer({} as never, [1024, 720], client);
}

describe("LiteLLM Responses streamer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes the proxy alias and consumes the final response structure", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "proxy-model");
    const create = vi.fn().mockResolvedValue(response());

    const events = await collect(streamerWith(create));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "proxy-model" }),
    );
    expect(events).toEqual([
      { type: SSEEventType.REASONING, content: "OK" },
      { type: SSEEventType.DONE },
    ]);
  });

  it.each([
    [401, "invalid API key"],
    [404, "model not found"],
    [400, "context window exceeded"],
  ])("gracefully reports API status %i: %s", async (status) => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "proxy-model");
    const error = new OpenAI.APIError(status, { message: "rejected" }, "rejected", {});

    const events = await collect(streamerWith(vi.fn().mockRejectedValue(error)));

    expect(events).toEqual([
      {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      },
    ]);
  });

  it("reports rate limiting with the existing quota guidance", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "proxy-model");
    const error = new OpenAI.APIError(429, { message: "rate limited" }, "rate limited", {});

    const events = await collect(streamerWith(vi.fn().mockRejectedValue(error)));

    expect(events[0]).toMatchObject({ type: SSEEventType.ERROR });
    expect(events[0]).toHaveProperty("content", expect.stringContaining("quota"));
    expect(events[1]).toEqual({ type: SSEEventType.DONE });
  });

  it("rejects an empty provider response", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "proxy-model");
    const empty = { id: "resp-empty", output: [], output_text: "" };

    const events = await collect(
      streamerWith(vi.fn().mockResolvedValue(empty)),
    );

    expect(events).toEqual([
      {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      },
    ]);
  });

  it("gracefully reports timeout and malformed-response failures", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_MODEL", "proxy-model");
    for (const error of [new Error("request timed out"), new Error("malformed response")]) {
      const events = await collect(
        streamerWith(vi.fn().mockRejectedValue(error)),
      );
      expect(events[0]).toMatchObject({ type: SSEEventType.ERROR });
    }
  });
});

describe.skipIf(
  !process.env.LITELLM_E2E_BASE_URL ||
    !process.env.LITELLM_E2E_API_KEY ||
    !process.env.LITELLM_E2E_MODEL,
)("LiteLLM live E2E", () => {
  it("consumes a real proxy Responses API result", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_API_KEY", process.env.LITELLM_E2E_API_KEY);
    vi.stubEnv("LITELLM_BASE_URL", process.env.LITELLM_E2E_BASE_URL);
    vi.stubEnv("LITELLM_MODEL", process.env.LITELLM_E2E_MODEL);

    const events = await collect(
      new OpenAIComputerStreamer({} as never, [1024, 720]),
    );

    expect(events.some((event) => event.type === SSEEventType.REASONING)).toBe(true);
    expect(events.at(-1)).toEqual({ type: SSEEventType.DONE });
  }, 60_000);
});
