"use server";

import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { Sandbox } from "@e2b/desktop";
import { redirect } from "next/navigation";
import {
  clearCurrentSession,
  getInitializedDatabase,
  requireCurrentUser,
} from "@/lib/auth";
import { getSandboxForUser, touchSandboxForUser } from "@/lib/auth-store";

export async function increaseTimeout(sandboxId: string) {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return false;
  }

  try {
    const desktop = await Sandbox.connect(sandboxId);
    await desktop.setTimeout(SANDBOX_TIMEOUT_MS); // 5 minutes
    await touchSandboxForUser(db, user.id, sandboxId);
    return true;
  } catch (error) {
    console.error("Failed to increase timeout:", error);
    return false;
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
    return true;
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return false;
  }
}

export async function logoutAction() {
  await clearCurrentSession();
  redirect("/login");
}
