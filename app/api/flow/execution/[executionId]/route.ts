/**
 * Flow Execution API - Get execution status and results
 */
import { NextResponse } from "next/server";
import { executionManager } from "@/lib/flow/execution-manager";

/**
 * GET /api/flow/execution/[executionId] - Get execution status
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;

  const execution = executionManager.getExecution(executionId);

  if (!execution) {
    return NextResponse.json(
      { error: "Execution not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ execution });
}

/**
 * DELETE /api/flow/execution/[executionId] - Abort execution
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;

  const aborted = executionManager.abortExecution(executionId);

  if (!aborted) {
    return NextResponse.json(
      { error: "Execution not found or already completed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: "Execution aborted" });
}
