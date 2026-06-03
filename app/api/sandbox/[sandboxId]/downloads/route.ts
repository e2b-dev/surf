import { Sandbox } from "@e2b/desktop";

import { getInitializedDatabase, requireCurrentUser } from "@/lib/auth";
import { getSandboxForUser, touchSandboxForUser } from "@/lib/auth-store";
import {
  buildSandboxDownloadsArchiveCommand,
  DOWNLOAD_EXPORT_PATH,
} from "@/lib/sandbox-downloads";

type RouteContext = {
  params: Promise<{ sandboxId: string }>;
};

function getCommandOutput(error: unknown): string {
  if (!error || typeof error !== "object") return "";

  const stdout = "stdout" in error ? String(error.stdout || "") : "";
  const stderr = "stderr" in error ? String(error.stderr || "") : "";

  return `${stdout}\n${stderr}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const db = await getInitializedDatabase();
  const { sandboxId } = await context.params;

  if (!(await getSandboxForUser(db, user.id, sandboxId))) {
    return new Response("Sandbox not found", { status: 404 });
  }

  try {
    const desktop = await Sandbox.connect(sandboxId);

    await desktop.commands.run(buildSandboxDownloadsArchiveCommand());
    await touchSandboxForUser(db, user.id, sandboxId);

    const archive = await desktop.files.read(DOWNLOAD_EXPORT_PATH, {
      format: "bytes",
    });

    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="paychex-downloads-${sandboxId}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const output = getCommandOutput(error);

    if (output.includes("NO_DOWNLOAD_DIR") || output.includes("NO_DOWNLOADS")) {
      return new Response("No completed supported downloads found", {
        status: 404,
      });
    }

    console.error("Failed to export sandbox downloads:", error);
    return new Response("Failed to export sandbox downloads", { status: 500 });
  }
}
