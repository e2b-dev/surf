/**
 * Cheap smoke test for the E2B fork plumbing (no OpenAI involved).
 *
 * Verifies:
 *  1. A desktop sandbox can be created + streamed on the 2.x SDK.
 *  2. `createSnapshot()` works on a desktop sandbox.
 *  3. `Sandbox.create(snapshotId)` forks it into working, streaming sandboxes.
 *  4. Forks share the snapshot's filesystem (marker file) and memory
 *     (the Firefox window launched before the snapshot is still there).
 *
 * Run: node --env-file=.env.local --import tsx scripts/smoke-fork.mts
 */
import { Sandbox } from "@e2b/desktop";
import { writeFileSync } from "node:fs";

const RES: [number, number] = [1024, 768];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(sbx: Sandbox, name: string) {
  const png = Buffer.from(await sbx.screenshot());
  const path = `/tmp/smoke-${name}.png`;
  writeFileSync(path, png);
  console.log(`  screenshot -> ${path} (${png.length} bytes)`);
}

async function main() {
  console.log("Creating primary desktop sandbox…");
  const primary = await Sandbox.create({
    resolution: RES,
    dpi: 96,
    timeoutMs: 300_000,
  });
  await primary.stream.start();
  console.log("  sandboxId:", primary.sandboxId);
  console.log("  vncUrl:", primary.stream.getUrl());

  // Filesystem marker (proves fs is shared into forks).
  const marker = `snapshot-marker-${primary.sandboxId}`;
  await primary.files.write("/home/user/marker.txt", marker);

  // Launch a GUI app (Firefox) so we can see whether the *running process*
  // survives into the forks (memory snapshot).
  console.log("Launching Firefox in the primary…");
  await primary.commands
    .run("DISPLAY=:0 firefox-esr https://news.ycombinator.com/news >/tmp/ff.log 2>&1 &", {
      background: true,
      timeoutMs: 0,
    })
    .catch(async () => {
      // Some templates ship `firefox` instead of `firefox-esr`.
      await primary.commands.run(
        "DISPLAY=:0 firefox https://news.ycombinator.com/news >/tmp/ff.log 2>&1 &",
        { background: true, timeoutMs: 0 }
      );
    });
  await sleep(12_000);
  await shot(primary, "primary");

  console.log("Creating snapshot…");
  const snap = await primary.createSnapshot({
    name: `smoke-fork-${primary.sandboxId.slice(0, 8)}`,
  });
  console.log("  snapshotId:", snap.snapshotId);

  console.log("Forking x3 from snapshot…");
  const forks = await Promise.all(
    Array.from({ length: 3 }, async (_, i) => {
      const fork = await Sandbox.create(snap.snapshotId, {
        resolution: RES,
        dpi: 96,
        timeoutMs: 300_000,
        metadata: { role: "smoke-fork", index: String(i) },
      });
      await fork.stream.stop().catch(() => {});
      await fork.stream.start();
      return fork;
    })
  );

  for (const [i, fork] of forks.entries()) {
    console.log(`Fork ${i}: ${fork.sandboxId}`);
    console.log(`  vncUrl: ${fork.stream.getUrl()}`);
    const read = await fork.files.read("/home/user/marker.txt").catch(() => "<missing>");
    console.log(`  marker matches: ${read === marker} (${read})`);
    await sleep(3_000);
    await shot(fork, `fork-${i}`);
  }

  console.log("Tearing down…");
  await Promise.allSettled([
    primary.kill(),
    ...forks.map((f) => f.kill()),
  ]);
  console.log("Done.");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
