import assert from "node:assert/strict";
import { test } from "node:test";

import {
  E2BSandboxLifecycleError,
  pauseSandboxProvider,
  resumeSandboxProvider,
} from "./sandbox-lifecycle";

function createJsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("pauseSandboxProvider calls the E2B pause endpoint with the API key", async () => {
  const calls: { url: string; init: RequestInit }[] = [];

  await pauseSandboxProvider("sandbox-123", {
    apiKey: "test-key",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.e2b.app/sandboxes/sandbox-123/pause");
  assert.equal(calls[0].init.method, "POST");
  assert.equal((calls[0].init.headers as Record<string, string>)["X-API-KEY"], "test-key");
});

test("resumeSandboxProvider calls the E2B resume endpoint with timeout seconds", async () => {
  const calls: { url: string; init: RequestInit }[] = [];

  await resumeSandboxProvider("sandbox-456", 3_600_000, {
    apiKey: "test-key",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return createJsonResponse(201, { sandboxID: "sandbox-456" });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.e2b.app/sandboxes/sandbox-456/resume");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, JSON.stringify({ autoPause: false, timeout: 3600 }));
  assert.equal((calls[0].init.headers as Record<string, string>)["content-type"], "application/json");
});

test("sandbox lifecycle provider errors include the response status", async () => {
  await assert.rejects(
    pauseSandboxProvider("missing-sandbox", {
      apiKey: "test-key",
      fetch: async () => createJsonResponse(404, { message: "not found" }),
    }),
    (error) => {
      assert.ok(error instanceof E2BSandboxLifecycleError);
      assert.equal(error.status, 404);
      assert.match(error.message, /not found/);
      return true;
    }
  );
});
