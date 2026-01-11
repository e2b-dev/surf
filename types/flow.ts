/**
 * Type definitions for Flow Simulation System
 */
import { ComputerAction } from "@/types/anthropic";

/**
 * Expected state verification configuration
 */
export interface ExpectedState {
  type: "screenshot" | "file" | "process";
  /** AI prompt to verify screenshot (e.g., "Does this show a JIRA issue created?") */
  screenshotPrompt?: string;
  /** File path to verify exists */
  filePath?: string;
  /** Content the file should contain */
  fileContains?: string;
  /** Process name to check is running */
  processName?: string;
}

/**
 * A single step in a flow
 */
export interface FlowStep {
  id: string;
  name: string;
  description: string;
  /** The instruction given to the AI to execute this step */
  prompt: string;
  /** Expected state after step completion for verification */
  expectedState: ExpectedState;
  /** Maximum duration in ms for this step */
  timeout?: number;
}

/**
 * A complete flow definition with multiple steps
 */
export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A specific ordering of steps to execute
 */
export interface FlowPermutation {
  id: string;
  /** Ordered list of step IDs */
  stepOrder: string[];
  /** Human-readable label like "A->B->C" */
  label: string;
}

/**
 * A single recorded frame during execution
 */
export interface FlowRecordingFrame {
  frameId: string;
  /** Milliseconds since execution start */
  timestamp: number;
  /** Base64 encoded screenshot */
  screenshot: string;
  /** Action performed (if any) */
  action?: ComputerAction;
  /** AI reasoning for the action */
  reasoning?: string;
  /** Which step this frame belongs to */
  stepId: string;
  /** Step name for display */
  stepName: string;
}

/**
 * Complete recording of a flow execution
 */
export interface FlowRecording {
  permutationId: string;
  frames: FlowRecordingFrame[];
  totalDuration: number;
  /** Timestamps where each step starts */
  stepBoundaries: { stepId: string; startTime: number; endTime: number }[];
}

/**
 * Result of verifying an expected state
 */
export interface VerificationResult {
  stepId: string;
  passed: boolean;
  /** Confidence level 0-1 */
  confidence: number;
  /** AI explanation of why it passed/failed */
  reasoning: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Status of a permutation execution
 */
export type PermutationStatus =
  | "pending"
  | "running"
  | "verifying"
  | "completed"
  | "failed";

/**
 * Result of executing a single permutation
 */
export interface PermutationResult {
  permutationId: string;
  /** Step order like ['A', 'B', 'C'] */
  order: string[];
  /** Label like "A->B->C" */
  label: string;
  status: PermutationStatus;
  passed: boolean;
  /** Recording of all frames */
  recording: FlowRecording;
  /** Verification results for each step */
  verificationResults: VerificationResult[];
  /** VNC URL for live viewing */
  vncUrl?: string;
  /** Sandbox ID */
  sandboxId?: string;
  /** Error message if failed */
  error?: string;
  /** Start time */
  startedAt?: Date;
  /** End time */
  completedAt?: Date;
}

/**
 * Status of overall flow execution
 */
export type FlowExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

/**
 * Summary of a flow execution
 */
export interface FlowExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  pending: number;
}

/**
 * Complete flow execution result
 */
export interface FlowExecutionResult {
  executionId: string;
  flowId: string;
  flowName: string;
  status: FlowExecutionStatus;
  permutations: PermutationResult[];
  summary: FlowExecutionSummary;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Options for executing a flow
 */
export interface FlowExecutionOptions {
  /** Which permutations to run: 'all' or specific permutation IDs */
  permutations: "all" | string[];
  /** Maximum parallel sandboxes */
  maxParallel: number;
  /** Desktop resolution */
  resolution: [number, number];
  /** AI model to use */
  model?: "openai" | "anthropic";
}

/**
 * Flow SSE event types
 */
export enum FlowSSEEventType {
  FLOW_STARTED = "flow_started",
  PERMUTATION_STARTED = "permutation_started",
  STEP_STARTED = "step_started",
  ACTION = "action",
  SCREENSHOT = "screenshot",
  REASONING = "reasoning",
  STEP_COMPLETED = "step_completed",
  PERMUTATION_COMPLETED = "permutation_completed",
  FLOW_COMPLETED = "flow_completed",
  FRAME_CAPTURED = "frame_captured",
  ERROR = "error",
}

/**
 * Base flow SSE event
 */
export interface BaseFlowSSEEvent {
  type: FlowSSEEventType;
}

/**
 * Flow started event
 */
export interface FlowStartedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.FLOW_STARTED;
  executionId: string;
  flowId: string;
  totalPermutations: number;
}

/**
 * Permutation started event
 */
export interface PermutationStartedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.PERMUTATION_STARTED;
  permutationId: string;
  order: string[];
  label: string;
  sandboxId: string;
  vncUrl: string;
}

/**
 * Step started event
 */
export interface StepStartedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.STEP_STARTED;
  permutationId: string;
  stepId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
}

/**
 * Action event during flow execution
 */
export interface FlowActionEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.ACTION;
  permutationId: string;
  action: ComputerAction;
}

/**
 * Screenshot event during flow execution
 */
export interface FlowScreenshotEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.SCREENSHOT;
  permutationId: string;
  screenshot: string;
}

/**
 * Reasoning event during flow execution
 */
export interface FlowReasoningEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.REASONING;
  permutationId: string;
  content: string;
}

/**
 * Step completed event
 */
export interface StepCompletedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.STEP_COMPLETED;
  permutationId: string;
  stepId: string;
  stepName: string;
  passed: boolean;
  verification: VerificationResult;
}

/**
 * Permutation completed event
 */
export interface PermutationCompletedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.PERMUTATION_COMPLETED;
  permutationId: string;
  label: string;
  passed: boolean;
  verificationResults: VerificationResult[];
}

/**
 * Flow completed event
 */
export interface FlowCompletedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.FLOW_COMPLETED;
  executionId: string;
  summary: FlowExecutionSummary;
}

/**
 * Frame captured event
 */
export interface FrameCapturedEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.FRAME_CAPTURED;
  permutationId: string;
  frame: FlowRecordingFrame;
}

/**
 * Error event
 */
export interface FlowErrorEvent extends BaseFlowSSEEvent {
  type: FlowSSEEventType.ERROR;
  permutationId?: string;
  error: string;
}

/**
 * Union of all flow SSE events
 */
export type FlowSSEEvent =
  | FlowStartedEvent
  | PermutationStartedEvent
  | StepStartedEvent
  | FlowActionEvent
  | FlowScreenshotEvent
  | FlowReasoningEvent
  | StepCompletedEvent
  | PermutationCompletedEvent
  | FlowCompletedEvent
  | FrameCapturedEvent
  | FlowErrorEvent;
