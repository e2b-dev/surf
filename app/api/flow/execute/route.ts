/**
 * Flow Execute API - Start flow execution
 */
import { NextResponse } from "next/server";
import { getFlowById, getDefaultFlow } from "@/lib/flow/storage";
import { executionManager } from "@/lib/flow/execution-manager";
import { FlowExecutionOptions, FlowSSEEvent, FlowSSEEventType } from "@/types/flow";
import { DEFAULT_RESOLUTION } from "@/lib/config";

export const maxDuration = 800;

/**
 * POST /api/flow/execute - Start flow execution
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      flowId,
      permutations = "all",
      maxParallel = 6,
      resolution = DEFAULT_RESOLUTION,
      model = "openai",
    } = body;

    // Get flow
    let flow;
    if (flowId) {
      flow = getFlowById(flowId);
      if (!flow) {
        return NextResponse.json(
          { error: `Flow not found: ${flowId}` },
          { status: 404 }
        );
      }
    } else {
      // Use default flow
      flow = getDefaultFlow();
    }

    const options: FlowExecutionOptions = {
      permutations,
      maxParallel,
      resolution,
      model,
    };

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of executionManager.executeFlow(
            flow,
            options
          )) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        } catch (error) {
          const errorEvent: FlowSSEEvent = {
            type: FlowSSEEventType.ERROR,
            error:
              error instanceof Error ? error.message : "Execution failed",
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start execution",
      },
      { status: 500 }
    );
  }
}
