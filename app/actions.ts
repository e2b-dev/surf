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
  deleteSandboxRecordForUser,
  getLatestActiveSandboxForUser,
  getSandboxForUser,
  touchSandboxForUser,
  type SandboxRecord,
} from "@/lib/auth-store";

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
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.kill();
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
