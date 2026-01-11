/**
 * Flow API - List and create flows
 */
import { NextResponse } from "next/server";
import {
  FlowBuilder,
  DOWNLOAD_STEP,
  JIRA_STEP,
  VSCODE_STEP,
} from "@/lib/flow/definition";
import { getAllFlows, saveFlow } from "@/lib/flow/storage";

/**
 * GET /api/flow - List all flows
 */
export async function GET() {
  const flowList = getAllFlows();
  return NextResponse.json({ flows: flowList });
}

/**
 * POST /api/flow - Create a new flow
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, steps } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Flow name is required" },
        { status: 400 }
      );
    }

    const builder = new FlowBuilder(name);
    if (description) {
      builder.setDescription(description);
    }

    // Add steps
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        // Support step names like "Download", "JIRA", "VSCode" or custom steps
        if (typeof step === "string") {
          switch (step.toLowerCase()) {
            case "download":
            case "a":
              builder.addStep(DOWNLOAD_STEP);
              break;
            case "jira":
            case "b":
              builder.addStep(JIRA_STEP);
              break;
            case "vscode":
            case "c":
              builder.addStep(VSCODE_STEP);
              break;
            default:
              return NextResponse.json(
                { error: `Unknown step name: ${step}` },
                { status: 400 }
              );
          }
        } else {
          // Custom step object
          builder.addStep(step);
        }
      }
    } else {
      // Default steps if none provided
      builder.addStep(DOWNLOAD_STEP);
      builder.addStep(JIRA_STEP);
      builder.addStep(VSCODE_STEP);
    }

    const flow = builder.build();
    saveFlow(flow);

    return NextResponse.json({ flowId: flow.id, flow });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create flow" },
      { status: 500 }
    );
  }
}
