import test from "node:test";
import assert from "node:assert/strict";

import {
  getX11VncScaleCommand,
  normalizeSandboxStreamResolution,
  withScaledStreamResize,
} from "./sandbox-stream";

test("stream URL uses scaled resizing for browser-sized viewport fit", () => {
  const url = withScaledStreamResize(
    "https://example.test/vnc.html?autoconnect=true&resize=remote"
  );

  assert.equal(
    url,
    "https://example.test/vnc.html?autoconnect=true&resize=scale"
  );
});

test("stream URL adds scaled resizing when the provider URL has no resize mode", () => {
  const url = withScaledStreamResize("https://example.test/vnc.html");

  assert.equal(url, "https://example.test/vnc.html?resize=scale");
});

test("sandbox stream resolution floors to even whole pixels that fit the viewport", () => {
  assert.deepEqual(normalizeSandboxStreamResolution([831.6, 670.4]), [830, 670]);
  assert.deepEqual(normalizeSandboxStreamResolution([599, 734]), [598, 734]);
});

test("sandbox stream resolution clamps invalid and extreme dimensions", () => {
  assert.deepEqual(normalizeSandboxStreamResolution([0, Number.NaN]), [1, 1]);
  assert.deepEqual(normalizeSandboxStreamResolution([9000, 5000]), [4096, 4096]);
});

test("x11vnc scale command uses normalized dimensions", () => {
  assert.equal(
    getX11VncScaleCommand([831.6, 670.4]),
    "DISPLAY=:0 x11vnc -R scale:830x670"
  );
});
