/**
 * Flow Playback API - Get recording data for playback
 */
import { NextResponse } from "next/server";
import { recordingStorage } from "@/lib/flow/recorder";
import { executionManager } from "@/lib/flow/execution-manager";

/**
 * GET /api/flow/execution/[executionId]/playback - Get playback data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;
  const { searchParams } = new URL(request.url);
  const permutationId = searchParams.get("permutationId");

  // Check if execution exists
  const execution = executionManager.getExecution(executionId);
  if (!execution) {
    return NextResponse.json(
      { error: "Execution not found" },
      { status: 404 }
    );
  }

  if (permutationId) {
    // Get specific permutation recording
    const recording = await recordingStorage.get(executionId, permutationId);

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      recording,
      permutation: execution.permutations.find(
        (p) => p.permutationId === permutationId
      ),
    });
  }

  // Get all recordings for the execution
  const recordings = await recordingStorage.getAllForExecution(executionId);

  return NextResponse.json({
    recordings,
    permutations: execution.permutations,
  });
}
