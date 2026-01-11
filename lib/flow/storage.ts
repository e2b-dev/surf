/**
 * Flow storage - In-memory storage for flows
 */
import { FlowDefinition } from "@/types/flow";
import { createDefaultFlow } from "./definition";

// In-memory storage for flows (could be extended to use a database)
const flows: Map<string, FlowDefinition> = new Map();

// Initialize with default flow
const defaultFlow = createDefaultFlow();
flows.set(defaultFlow.id, defaultFlow);

/**
 * Get a flow by ID
 */
export function getFlowById(flowId: string): FlowDefinition | undefined {
  return flows.get(flowId);
}

/**
 * Get the default flow
 */
export function getDefaultFlow(): FlowDefinition {
  return defaultFlow;
}

/**
 * Save a flow
 */
export function saveFlow(flow: FlowDefinition): void {
  flows.set(flow.id, flow);
}

/**
 * Get all flows
 */
export function getAllFlows(): FlowDefinition[] {
  return Array.from(flows.values());
}

/**
 * Delete a flow
 */
export function deleteFlow(flowId: string): boolean {
  return flows.delete(flowId);
}
