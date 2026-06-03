import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  SANDBOX_TIMEOUT_OPTIONS,
  SANDBOX_PROVIDER_MAX_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
  getAllowedSandboxTimeoutMs,
  getSandboxProviderTimeoutMs,
} from "./config";

test("default sandbox timeout uses the E2B one hour maximum", () => {
  assert.equal(DEFAULT_SANDBOX_TIMEOUT_MS, 60 * 60 * 1000);
  assert.equal(SANDBOX_TIMEOUT_MS, DEFAULT_SANDBOX_TIMEOUT_MS);
});

test("sandbox timeout choices include user-facing extension options", () => {
  assert.deepEqual(
    SANDBOX_TIMEOUT_OPTIONS.map((option) => option.minutes),
    [15, 30, 60, 480, 720, 1440, 2160]
  );
  assert.equal(getAllowedSandboxTimeoutMs(30 * 60 * 1000), 30 * 60 * 1000);
  assert.equal(getAllowedSandboxTimeoutMs(24 * 60 * 60 * 1000), 24 * 60 * 60 * 1000);
  assert.equal(getAllowedSandboxTimeoutMs(999), DEFAULT_SANDBOX_TIMEOUT_MS);
});

test("provider timeout is capped to the E2B one hour maximum", () => {
  assert.equal(SANDBOX_PROVIDER_MAX_TIMEOUT_MS, 60 * 60 * 1000);
  assert.equal(getSandboxProviderTimeoutMs(15 * 60 * 1000), 15 * 60 * 1000);
  assert.equal(getSandboxProviderTimeoutMs(8 * 60 * 60 * 1000), SANDBOX_PROVIDER_MAX_TIMEOUT_MS);
  assert.equal(getSandboxProviderTimeoutMs(36 * 60 * 60 * 1000), SANDBOX_PROVIDER_MAX_TIMEOUT_MS);
});
