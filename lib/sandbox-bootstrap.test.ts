import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildChromeInstallCommand,
  buildChromeLaunchCommand,
} from "./sandbox-bootstrap";

test("Chrome install command installs Google Chrome only when no Chrome binary exists", () => {
  const command = buildChromeInstallCommand();

  assert.match(command, /command -v google-chrome/);
  assert.match(command, /command -v chromium/);
  assert.match(command, /apt-get update/);
  assert.match(command, /google-chrome-stable/);
});

test("Chrome install command does not exit early when Chrome is already present", () => {
  const command = buildChromeInstallCommand();

  assert.doesNotMatch(command, /\bexit\b/);
  assert.match(command, /else/);
});

test("Chrome launch command opens the Paychex portal in Chrome", () => {
  const command = buildChromeLaunchCommand(
    "https://partners.paychex.com/companies"
  );

  assert.match(command, /google-chrome/);
  assert.match(command, /--new-window/);
  assert.match(command, /--no-first-run/);
  assert.match(command, /https:\/\/partners\.paychex\.com\/companies/);
  assert.doesNotMatch(command, /firefox/i);
});
