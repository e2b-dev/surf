"use server";

import {
  getAllowedSandboxTimeoutMs,
  SANDBOX_TIMEOUT_MS,
  getSandboxProviderTimeoutMs,
} from "@/lib/config";
import { Sandbox } from "@e2b/desktop";
import { redirect } from "next/navigation";
import {
  clearCurrentSession,
  getInitializedDatabase,
  requireCurrentUser,
} from "@/lib/auth";
import { PAYCHEX_LOGIN_URL } from "@/lib/paychex-flow";
import { preparePaychexSandbox } from "@/lib/sandbox-bootstrap";
import {
  getX11VncScaleCommand,
  normalizeSandboxStreamResolution,
  withScaledStreamResize,
} from "@/lib/sandbox-stream";
import {
  createSandboxRecord,
  deleteAllSandboxRecordsForUser,
  deleteSandboxRecordForUser,
  getLatestActiveSandboxForUser,
  getLatestResumableSandboxForUser,
  getSandboxForUser,
  listSandboxesForUser,
  touchSandboxForUser,
  updateSandboxStateForUser,
  type SandboxRecord,
} from "@/lib/auth-store";
import {
  E2BSandboxLifecycleError,
  pauseSandboxProvider,
  resumeSandboxProvider,
} from "@/lib/sandbox-lifecycle";

type SandboxSessionResult =
  | {
      ok: true;
      sandboxId: string;
      vncUrl: string;
      timeoutMs: number;
      expiresAt: string;
      timeRemainingSeconds: number;
    }
  | { ok: false; error: string };

type ResizeSandboxDisplayResult =
  | { ok: true; resolution: [number, number] }
  | { ok: false; error: string; resolution: [number, number] };

export type SandboxSummary = {
  sandboxId: string;
  vncUrl: string;
  timeoutMs: number;
  expiresAt: string;
  timeRemainingSeconds: number;
  state: SandboxRecord["state"];
  pausedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
};

type ListSandboxesResult =
  | { ok: true; sandboxes: SandboxSummary[] }
  | { ok: false; error: string };

type SandboxMutationResult =
  | { ok: true; sandboxes: SandboxSummary[] }
  | { ok: false; error: string; sandboxes?: SandboxSummary[] };

function getExpiresAt(timeoutMs: number): Date {
  return new Date(Date.now() + timeoutMs);
}

function getRemainingSeconds(expiresAt: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}

async function getStreamUrl(desktop: Sandbox, fallbackUrl?: string) {
  const getScaledResizeUrl = () =>
    withScaledStreamResize(desktop.stream.getUrl({ resize: "scale" }));

  try {
    await desktop.stream.start();
    return getScaledResizeUrl();
  } catch (error) {
    if (
      fallbackUrl &&
      error instanceof Error &&
      error.message.toLowerCase().includes("already running")
    ) {
      return withScaledStreamResize(fallbackUrl);
    }

    throw error;
  }
}

function toSandboxSession(record: SandboxRecord): Extract<SandboxSessionResult, { ok: true }> {
  return {
    ok: true,
    sandboxId: record.sandboxId,
    vncUrl: record.vncUrl,
    timeoutMs: record.timeoutMs,
    expiresAt: record.expiresAt.toISOString(),
    timeRemainingSeconds: getRemainingSeconds(record.expiresAt),
  };
}

function toSandboxSummary(record: SandboxRecord): SandboxSummary {
  return {
    sandboxId: record.sandboxId,
    vncUrl: record.vncUrl,
    timeoutMs: record.timeoutMs,
    expiresAt: record.expiresAt.toISOString(),
    timeRemainingSeconds: getRemainingSeconds(record.expiresAt),
    state: record.state,
    pausedAt: record.pausedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
  };
}

async function getSandboxSummariesForUser(
  db: Awaited<ReturnType<typeof getInitializedDatabase>>,
  userId: string
): Promise<SandboxSummary[]> {
  const sandboxes = await listSandboxesForUser(db, userId);
  return sandboxes.map(toSandboxSummary);
}

function isUnavailableSandboxError(error: unknown): boolean {
  return (
    error instanceof E2BSandboxLifecycleError &&
    (error.status === 404 || error.status === 409)
  );
}

async function connectSandboxSession(
  record: SandboxRecord,
  options: { resumePaused: boolean }
): Promise<SandboxRecord> {
  if (record.state === "unavailable") {
    throw new Error("Sandbox is unavailable");
  }

  if (record.state === "paused" && options.resumePaused) {
    await resumeSandboxProvider(
      record.sandboxId,
      getSandboxProviderTimeoutMs(record.timeoutMs)
    );
  }

  const desktop = await Sandbox.connect(record.sandboxId);
  await desktop.setTimeout(getSandboxProviderTimeoutMs(record.timeoutMs));
  const vncUrl = await getStreamUrl(desktop, record.vncUrl);

  return createSandboxRecord(await getInitializedDatabase(), {
    userId: record.userId,
    sandboxId: record.sandboxId,
    vncUrl,
    timeoutMs: record.timeoutMs,
    expiresAt: getExpiresAt(record.timeoutMs),
    state: "running",
  });
}

export async function ensureSandboxAction(input?: {
  resolution?: [number, number];
}): Promise<SandboxSessionResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  if (!process.env.E2B_API_KEY) {
    return { ok: false, error: "Sandbox API key not found" };
  }

  const activeRecord = await getLatestActiveSandboxForUser(db, user.id);

  if (activeRecord) {
    try {
      const desktop = await Sandbox.connect(activeRecord.sandboxId);
      await desktop.setTimeout(getSandboxProviderTimeoutMs(activeRecord.timeoutMs));
      const vncUrl = await getStreamUrl(desktop, activeRecord.vncUrl);
      const record = await createSandboxRecord(db, {
        userId: user.id,
        sandboxId: activeRecord.sandboxId,
        vncUrl,
        timeoutMs: activeRecord.timeoutMs,
        expiresAt: activeRecord.expiresAt,
      });
      return toSandboxSession(record);
    } catch (error) {
      console.error("Failed to resume sandbox:", error);
      await deleteSandboxRecordForUser(db, user.id, activeRecord.sandboxId);
    }
  }

  try {
    const desktop = await Sandbox.create({
      resolution: input?.resolution,
      dpi: 96,
      timeoutMs: getSandboxProviderTimeoutMs(SANDBOX_TIMEOUT_MS),
    });
    const vncUrl = await getStreamUrl(desktop);
    const expiresAt = getExpiresAt(SANDBOX_TIMEOUT_MS);
    const record = await createSandboxRecord(db, {
      userId: user.id,
      sandboxId: desktop.sandboxId,
      vncUrl,
      timeoutMs: SANDBOX_TIMEOUT_MS,
      expiresAt,
    });

    try {
      await preparePaychexSandbox(desktop, PAYCHEX_LOGIN_URL);
    } catch (error) {
      console.error("Failed to prepare Paychex sandbox:", error);
    }

    return toSandboxSession(record);
  } catch (error) {
    console.error("Failed to start sandbox:", error);
    return { ok: false, error: "Failed to start sandbox" };
  }
}

export async function listSandboxesAction(): Promise<ListSandboxesResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  try {
    return {
      ok: true,
      sandboxes: await getSandboxSummariesForUser(db, user.id),
    };
  } catch (error) {
    console.error("Failed to list sandboxes:", error);
    return { ok: false, error: "Failed to list sandboxes" };
  }
}

export async function resumeLatestSandboxAction(): Promise<SandboxSessionResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const record = await getLatestResumableSandboxForUser(db, user.id);

  if (!record) {
    return { ok: false, error: "No saved sandbox found" };
  }

  return resumeSandboxAction(record.sandboxId);
}

export async function resumeSandboxAction(
  sandboxId: string
): Promise<SandboxSessionResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const record = await getSandboxForUser(db, user.id, sandboxId);

  if (!record) {
    return { ok: false, error: "Sandbox not found" };
  }

  if (record.state === "unavailable") {
    return { ok: false, error: "Sandbox is unavailable" };
  }

  try {
    const updated = await connectSandboxSession(record, { resumePaused: true });
    return toSandboxSession(updated);
  } catch (error) {
    console.error("Failed to resume sandbox:", error);
    if (isUnavailableSandboxError(error)) {
      await updateSandboxStateForUser(db, user.id, sandboxId, "unavailable");
    }
    return { ok: false, error: "Failed to resume sandbox" };
  }
}

export async function pauseSandboxAction(
  sandboxId: string
): Promise<SandboxMutationResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return { ok: false, error: "Sandbox not found" };
  }

  try {
    await pauseSandboxProvider(sandboxId);
    await updateSandboxStateForUser(db, user.id, sandboxId, "paused");
    return {
      ok: true,
      sandboxes: await getSandboxSummariesForUser(db, user.id),
    };
  } catch (error) {
    console.error("Failed to pause sandbox:", error);
    if (isUnavailableSandboxError(error)) {
      await updateSandboxStateForUser(db, user.id, sandboxId, "unavailable");
    }
    return {
      ok: false,
      error: "Failed to pause sandbox",
      sandboxes: await getSandboxSummariesForUser(db, user.id),
    };
  }
}

export async function deleteSandboxAction(
  sandboxId: string
): Promise<SandboxMutationResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return {
      ok: false,
      error: "Sandbox not found",
      sandboxes: await getSandboxSummariesForUser(db, user.id),
    };
  }

  try {
    await Sandbox.kill(sandboxId);
  } catch (error) {
    console.error("Failed to kill sandbox during delete:", error);
  }

  await deleteSandboxRecordForUser(db, user.id, sandboxId);

  return {
    ok: true,
    sandboxes: await getSandboxSummariesForUser(db, user.id),
  };
}

export async function deleteAllSandboxesAction(): Promise<SandboxMutationResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const sandboxes = await listSandboxesForUser(db, user.id);

  await Promise.all(
    sandboxes.map(async (sandbox) => {
      try {
        await Sandbox.kill(sandbox.sandboxId);
      } catch (error) {
        console.error("Failed to kill sandbox during delete all:", error);
      }
    })
  );

  await deleteAllSandboxRecordsForUser(db, user.id);

  return {
    ok: true,
    sandboxes: [],
  };
}

export async function increaseTimeout(sandboxId: string, timeoutMs?: number) {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const allowedTimeoutMs = getAllowedSandboxTimeoutMs(timeoutMs);
  const providerTimeoutMs = getSandboxProviderTimeoutMs(timeoutMs);
  const expiresAt = getExpiresAt(allowedTimeoutMs);

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return {
      ok: false,
      timeoutMs: allowedTimeoutMs,
      providerTimeoutMs,
      expiresAt: expiresAt.toISOString(),
      timeRemainingSeconds: getRemainingSeconds(expiresAt),
    };
  }

  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.setTimeout(providerTimeoutMs);
    await touchSandboxForUser(db, user.id, sandboxId, {
      timeoutMs: allowedTimeoutMs,
      expiresAt,
    });
    return {
      ok: true,
      timeoutMs: allowedTimeoutMs,
      providerTimeoutMs,
      expiresAt: expiresAt.toISOString(),
      timeRemainingSeconds: getRemainingSeconds(expiresAt),
    };
  } catch (error) {
    console.error("Failed to increase timeout:", error);
    return {
      ok: false,
      timeoutMs: allowedTimeoutMs,
      providerTimeoutMs,
      expiresAt: expiresAt.toISOString(),
      timeRemainingSeconds: getRemainingSeconds(expiresAt),
    };
  }
}

export async function resizeSandboxDisplayAction(
  sandboxId: string,
  resolution: [number, number]
): Promise<ResizeSandboxDisplayResult> {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const scaledResolution = normalizeSandboxStreamResolution(resolution);

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return {
      ok: false,
      error: "Sandbox not found",
      resolution: scaledResolution,
    };
  }

  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.commands.run(getX11VncScaleCommand(scaledResolution));
    return { ok: true, resolution: scaledResolution };
  } catch (error) {
    console.error("Failed to resize sandbox display:", error);
    return {
      ok: false,
      error: "Failed to resize sandbox display",
      resolution: scaledResolution,
    };
  }
}

export async function stopSandboxAction(sandboxId: string) {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return false;
  }

  try {
    await Sandbox.kill(sandboxId);
    await deleteSandboxRecordForUser(db, user.id, sandboxId);
    return true;
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    await deleteSandboxRecordForUser(db, user.id, sandboxId);
    return true;
  }
}

export async function logoutAction() {
  await clearCurrentSession();
  redirect("/login");
}
