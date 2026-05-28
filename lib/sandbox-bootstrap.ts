import type { Sandbox } from "@e2b/desktop";

import { PAYCHEX_LOGIN_URL } from "./paychex-flow";
import { logDebug, logError } from "./logger";

export function buildChromeInstallCommand(): string {
  return [
    "set -e",
    "if command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1; then",
    "  echo 'Chrome already installed'",
    "else",
    "  SUDO=$(if [ \"$(id -u)\" = \"0\" ]; then echo \"\"; else echo \"sudo\"; fi)",
    "  export DEBIAN_FRONTEND=noninteractive",
    "  $SUDO apt-get update",
    "  $SUDO apt-get install -y wget gnupg ca-certificates xdg-utils",
    "  $SUDO install -d -m 0755 /etc/apt/keyrings",
    "  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | $SUDO tee /etc/apt/keyrings/google-chrome.gpg >/dev/null",
    "  $SUDO chmod a+r /etc/apt/keyrings/google-chrome.gpg",
    '  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | $SUDO tee /etc/apt/sources.list.d/google-chrome.list >/dev/null',
    "  $SUDO apt-get update",
    "  $SUDO apt-get install -y google-chrome-stable",
    "fi",
  ].join("\n");
}

export function buildChromeLaunchCommand(url = PAYCHEX_LOGIN_URL): string {
  const escapedUrl = shellSingleQuote(url);

  return [
    "set -e",
    "CHROME_BIN=$(command -v google-chrome || command -v chromium || command -v chromium-browser)",
    '"$CHROME_BIN" --new-window --no-first-run --disable-first-run-ui --disable-default-apps ' +
      `${escapedUrl} >/tmp/paychex-chrome.log 2>&1 &`,
  ].join("\n");
}

export async function preparePaychexSandbox(
  desktop: Pick<Sandbox, "commands">,
  url = PAYCHEX_LOGIN_URL
): Promise<void> {
  try {
    logDebug("PAYCHEX_SANDBOX_BOOTSTRAP_START", { url });
    await desktop.commands.run(buildChromeInstallCommand(), {
      timeoutMs: 180_000,
    });
    await desktop.commands.run(buildChromeLaunchCommand(url), {
      background: true,
      timeoutMs: 0,
    });
    logDebug("PAYCHEX_SANDBOX_BOOTSTRAP_DONE", { url });
  } catch (error) {
    logError("PAYCHEX_SANDBOX_BOOTSTRAP_FAILED", error);
    throw error;
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
