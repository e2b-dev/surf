import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

/** Name of the derived template. NOT "desktop" — that's E2B's public base. */
const NAME = "surf-desktop";

// Load E2B_API_KEY from ../.env.local if it isn't already in the environment.
if (!process.env.E2B_API_KEY) {
  try {
    const envPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      ".env.local"
    );
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*E2B_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) process.env.E2B_API_KEY = m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    // fall through — build will error clearly if the key is missing
  }
}

async function main() {
  const info = await Template.build(template, NAME, {
    cpuCount: 8,
    memoryMB: 8192,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(`\nBuilt template "${NAME}":`, JSON.stringify(info, null, 2));
}

main().catch((e) => {
  console.error("Template build failed:", e);
  process.exit(1);
});
