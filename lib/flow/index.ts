/**
 * Flow module exports
 */

// Types
export * from "@/types/flow";

// Definition
export {
  FlowBuilder,
  createDefaultFlow,
  getStepByName,
  DOWNLOAD_STEP,
  JIRA_STEP,
  VSCODE_STEP,
  STEP_LABELS,
  LABEL_TO_STEP,
} from "./definition";

// Permutation
export {
  generatePermutationsArray,
  generateFlowPermutations,
  generatePermutationsWithNames,
  filterPermutationsByLabels,
  getPermutationCount,
} from "./permutation";

// Recorder
export {
  FlowRecorder,
  PlaybackController,
  RecordingStorage,
  recordingStorage,
} from "./recorder";

// Sandbox
export { RecordingSandbox, createRecordingSandbox } from "./sandbox-wrapper";

// VM Pool
export { VMPool, type VMPoolOptions } from "./vm-pool";

// Step Executor
export { FlowStepExecutor } from "./step-executor";

// Verification
export {
  ScreenshotVerifier,
  verifyPermutation,
  allVerificationsPassed,
  getVerificationSummary,
} from "./verification";

// Execution Manager
export { FlowExecutionManager, executionManager } from "./execution-manager";
