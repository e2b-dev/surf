/**
 * End-to-end test of the fork demo's backend using the REAL OpenAI computer-use
 * agent (the same OpenAIComputerStreamer that /api/chat uses).
 *
 *  1. Primary agent logs into Hacker News (the real auth flow).
 *  2. We snapshot the sandbox and fork it x3 (the real snapshotAndFork logic).
 *  3. Each fork runs its exploration task — already authenticated.
 *
 * Screenshots are taken directly from each sandbox so we can visually confirm
 * every fork is logged in.
 *
 * Run:
 *   export E2B_API_KEY=… OPENAI_API_KEY=…
 *   npx tsx scripts/e2e-fork.mts
 */
import { Sandbox } from "@e2b/desktop";
import { writeFileSync } from "node:fs";
import { OpenAIComputerStreamer } from "../lib/streaming/openai";
import { buildAuthTask, buildForkTasks } from "../lib/fork/config";

const RES: [number, number] = [1024, 768];

async function shot(sbx: Sandbox, name: string) {
  const png = Buffer.from(await sbx.screenshot());
  const path = `/tmp/e2e-${name}.png`;
  writeFileSync(path, png);
  console.log(`  📸 ${path} (${png.length} bytes)`);
}

async function runAgent(sbx: Sandbox, task: string, label: string) {
  const streamer = new OpenAIComputerStreamer(sbx, RES);
  const controller = new AbortController();
  let actions = 0;
  let lastReason = "";
  for await (const ev of streamer.stream({
    messages: [{ role: "user", content: task }],
    signal: controller.signal,
  })) {
    if (ev.type === "action") actions++;
    if (ev.type === "reasoning" && typeof ev.content === "string")
      lastReason = ev.content;
    if (ev.type === "error") console.log(`  [${label}] ERROR:`, ev.content);
    if (ev.type === "done") break;
  }
  console.log(`  [${label}] finished — ${actions} actions. Final: ${lastReason.slice(0, 200)}`);
}

async function main() {
  const username = process.env.DEMO_SITE_USERNAME!;
  const password = process.env.DEMO_SITE_PASSWORD!;
  if (!username || !password) throw new Error("Missing DEMO_SITE_* env vars");

  console.log("1) Create primary sandbox + stream");
  const primary = await Sandbox.create({ resolution: RES, dpi: 96, timeoutMs: 600_000 });
  await primary.stream.start();
  console.log("   sandboxId:", primary.sandboxId, "| vnc:", primary.stream.getUrl());

  console.log("2) Primary agent logs into Hacker News…");
  await runAgent(primary, buildAuthTask(username, password), "primary");
  await shot(primary, "primary-authed");

  console.log("3) Snapshot the authenticated sandbox");
  const snap = await primary.createSnapshot({ name: `e2e-fork-${primary.sandboxId.slice(0, 8)}` });
  console.log("   snapshotId:", snap.snapshotId);

  console.log("4) Fork x3");
  const forkTasks = buildForkTasks(username);
  const forks = await Promise.all(
    Array.from({ length: 3 }, async (_, i) => {
      const fork = await Sandbox.create(snap.snapshotId, {
        resolution: RES,
        dpi: 96,
        timeoutMs: 600_000,
        metadata: { role: "fork", index: String(i) },
      });
      await fork.stream.stop().catch(() => {});
      await fork.stream.start();
      console.log(`   fork ${i}: ${fork.sandboxId} | vnc: ${fork.stream.getUrl()}`);
      return fork;
    })
  );

  // Screenshot each fork immediately after resume (before exploring) to prove
  // it came up already authenticated.
  console.log("5) Screenshot forks on resume (should already be logged in)");
  for (const [i, fork] of forks.entries()) await shot(fork, `fork-${i}-resumed`);

  console.log("6) Run each fork's exploration task in parallel");
  await Promise.all(
    forks.map((fork, i) => runAgent(fork, forkTasks[i].prompt, `fork-${i}`))
  );
  for (const [i, fork] of forks.entries()) await shot(fork, `fork-${i}-explored`);

  console.log("7) Tear down");
  await Promise.allSettled([primary.kill(), ...forks.map((f) => f.kill())]);
  console.log("✅ Done");
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
