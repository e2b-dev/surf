"use server";

import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import {
  buildAuthTask,
  buildForkTasks,
  DEMO_SITE,
  ForkDemoConfig,
  FORK_COUNT,
  FORK_RESOLUTION,
} from "@/lib/fork/config";
import { Sandbox } from "@e2b/desktop";
import { logError, logSuccess } from "@/lib/logger";

/** Port the desktop noVNC server listens on (see @e2b/desktop VNCServer). */
const VNC_PORT = 6080;

export async function increaseTimeout(sandboxId: string) {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.setTimeout(SANDBOX_TIMEOUT_MS); // 5 minutes
    return true;
  } catch (error) {
    console.error("Failed to increase timeout:", error);
    return false;
  }
}

export async function stopSandboxAction(sandboxId: string) {
  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.kill();
    return true;
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return false;
  }
}

/**
 * Returns the fork-demo tasks, built on the server from the credentials in
 * .env.local. Keeps the password out of the client bundle.
 */
export async function getForkDemoConfig(): Promise<ForkDemoConfig> {
  const username = process.env.DEMO_SITE_USERNAME;
  const password = process.env.DEMO_SITE_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "DEMO_SITE_USERNAME / DEMO_SITE_PASSWORD are not set in .env.local"
    );
  }

  return {
    siteLabel: DEMO_SITE.label,
    username,
    authTask: buildAuthTask(username, password),
    forkTasks: buildForkTasks(username),
  };
}

export interface ForkInfo {
  sandboxId: string;
  vncUrl: string;
}

export interface SnapshotAndForkResult {
  /** Snapshot identifier that can be passed to Sandbox.create() to make more forks. */
  snapshotId: string;
  /** The freshly created forks, each already streaming and sharing the snapshot's state. */
  forks: ForkInfo[];
}

/**
 * Snapshot an authenticated sandbox and fork it into `count` independent sandboxes.
 *
 * The snapshot captures the full sandbox state — memory *and* filesystem — which
 * includes the running browser and its live authenticated session. Every fork
 * created from the snapshot therefore resumes already logged in, and can explore
 * the site in parallel without ever authenticating again.
 *
 * This is the heart of the demo: one expensive/sensitive step (the auth flow) is
 * done once, then cheaply shared across many parallel agents.
 */
export async function snapshotAndForkAction(
  sandboxId: string,
  count: number = FORK_COUNT
): Promise<SnapshotAndForkResult> {
  // Connect to the source sandbox and snapshot it. createSnapshot pauses the
  // sandbox while it captures a persistent image of the full state.
  const source = await Sandbox.connect(sandboxId);
  const snapshot = await source.createSnapshot({
    name: `surf-fork-${sandboxId.slice(0, 8)}`,
  });

  logSuccess("Created snapshot for fork", {
    sandboxId,
    snapshotId: snapshot.snapshotId,
  });

  // Fork the snapshot into `count` independent sandboxes, in parallel. Each fork
  // is a full desktop sandbox that resumes from the snapshot's state.
  const forks = await Promise.all(
    Array.from({ length: count }, async (_, index): Promise<ForkInfo> => {
      const fork = await Sandbox.create(snapshot.snapshotId, {
        resolution: FORK_RESOLUTION,
        dpi: 96,
        timeoutMs: SANDBOX_TIMEOUT_MS,
        metadata: {
          surfRole: "fork",
          surfForkIndex: String(index),
          surfSnapshot: snapshot.snapshotId,
        },
      });

      // The snapshot was taken with the VNC stream running, so each fork resumes
      // with it already up. Try to start it (works if it isn't running); if it's
      // already running we can't call start() again, so derive the stream URL
      // directly from the fork's host — the noVNC server is already serving it.
      let vncUrl: string;
      try {
        await fork.stream.start();
        vncUrl = fork.stream.getUrl();
      } catch {
        vncUrl = `https://${fork.getHost(VNC_PORT)}/vnc.html?autoconnect=true&resize=scale`;
      }

      return { sandboxId: fork.sandboxId, vncUrl };
    })
  );

  logSuccess("Forked authenticated sandbox", {
    sandboxId,
    snapshotId: snapshot.snapshotId,
    forkIds: forks.map((f) => f.sandboxId),
  });

  return { snapshotId: snapshot.snapshotId, forks };
}

/**
 * Stop a set of sandboxes (used to tear down all forks at once).
 */
export async function stopSandboxesAction(sandboxIds: string[]) {
  const results = await Promise.allSettled(
    sandboxIds.map(async (id) => {
      const desktop = await Sandbox.connect(id);
      await desktop.kill();
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    logError("Failed to stop some sandboxes", { failedCount: failed.length });
  }

  return failed.length === 0;
}
