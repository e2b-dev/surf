/**
 * Flow Execution Manager - orchestrates parallel flow execution
 */
import { v4 as uuidv4 } from "uuid";
import {
  FlowDefinition,
  FlowPermutation,
  FlowExecutionOptions,
  FlowExecutionResult,
  FlowExecutionStatus,
  FlowSSEEvent,
  FlowSSEEventType,
  PermutationResult,
  VerificationResult,
  FlowStep,
} from "@/types/flow";
import { VMPool } from "./vm-pool";
import { RecordingSandbox } from "./sandbox-wrapper";
import { FlowStepExecutor } from "./step-executor";
import { generateFlowPermutations, filterPermutationsByLabels } from "./permutation";
import { ScreenshotVerifier, allVerificationsPassed } from "./verification";
import { recordingStorage } from "./recorder";
import { logDebug, logError } from "../logger";

/**
 * FlowExecutionManager orchestrates the execution of flows across multiple VMs
 */
export class FlowExecutionManager {
  private vmPool: VMPool | null = null;
  private executions: Map<string, FlowExecutionResult> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Execute a flow with all or selected permutations
   */
  async *executeFlow(
    flow: FlowDefinition,
    options: FlowExecutionOptions
  ): AsyncGenerator<FlowSSEEvent> {
    const executionId = uuidv4();
    const abortController = new AbortController();
    this.abortControllers.set(executionId, abortController);

    // Generate permutations
    let permutations = generateFlowPermutations(flow.steps);

    if (options.permutations !== "all") {
      permutations = filterPermutationsByLabels(
        permutations,
        options.permutations
      );
    }

    const totalPermutations = permutations.length;

    // Initialize execution result
    const executionResult: FlowExecutionResult = {
      executionId,
      flowId: flow.id,
      flowName: flow.name,
      status: "running",
      permutations: [],
      summary: {
        total: totalPermutations,
        passed: 0,
        failed: 0,
        running: 0,
        pending: totalPermutations,
      },
      startedAt: new Date(),
    };

    this.executions.set(executionId, executionResult);

    // Yield flow started event
    yield {
      type: FlowSSEEventType.FLOW_STARTED,
      executionId,
      flowId: flow.id,
      totalPermutations,
    };

    // Create VM pool
    this.vmPool = new VMPool({
      maxConcurrent: options.maxParallel,
      resolution: options.resolution,
      timeoutMs: 600000, // 10 minutes per sandbox
    });

    try {
      // Acquire sandboxes for all permutations
      const permutationIds = permutations.map((p) => p.id);
      const sandboxes = await this.vmPool.acquire(permutationIds);

      // Initialize permutation results
      for (const perm of permutations) {
        const sandbox = sandboxes.get(perm.id);
        const permResult: PermutationResult = {
          permutationId: perm.id,
          order: perm.stepOrder,
          label: perm.label,
          status: sandbox ? "pending" : "failed",
          passed: false,
          recording: {
            permutationId: perm.id,
            frames: [],
            totalDuration: 0,
            stepBoundaries: [],
          },
          verificationResults: [],
          vncUrl: sandbox?.getVncUrl() || undefined,
          sandboxId: sandbox?.sandboxId,
          error: sandbox ? undefined : "Failed to create sandbox",
          startedAt: new Date(),
        };
        executionResult.permutations.push(permResult);

        // Yield permutation started if sandbox was acquired
        if (sandbox) {
          yield {
            type: FlowSSEEventType.PERMUTATION_STARTED,
            permutationId: perm.id,
            order: perm.stepOrder,
            label: perm.label,
            sandboxId: sandbox.sandboxId,
            vncUrl: sandbox.getVncUrl() || "",
          };
        }
      }

      // Execute all permutations in parallel
      const executionPromises = permutations.map((perm) =>
        this.executePermutation(
          executionId,
          flow,
          perm,
          sandboxes.get(perm.id),
          options,
          abortController.signal
        )
      );

      // Collect events from all permutations
      const eventGenerators = await Promise.all(executionPromises);

      // Merge events from all generators
      for await (const event of this.mergeAsyncGenerators(eventGenerators)) {
        // Update execution result based on event
        this.updateExecutionResult(executionResult, event);
        yield event;
      }

      // Calculate final summary
      executionResult.status = "completed";
      executionResult.completedAt = new Date();
      executionResult.summary = this.calculateSummary(executionResult.permutations);

      // Yield flow completed
      yield {
        type: FlowSSEEventType.FLOW_COMPLETED,
        executionId,
        summary: executionResult.summary,
      };
    } catch (error) {
      logError("ExecutionManager", error);
      yield {
        type: FlowSSEEventType.ERROR,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      executionResult.status = "failed";
    } finally {
      // Cleanup
      if (this.vmPool) {
        await this.vmPool.releaseAll();
        this.vmPool = null;
      }
      this.abortControllers.delete(executionId);
    }
  }

  /**
   * Execute a single permutation
   */
  private async executePermutation(
    executionId: string,
    flow: FlowDefinition,
    permutation: FlowPermutation,
    sandbox: RecordingSandbox | undefined,
    options: FlowExecutionOptions,
    signal: AbortSignal
  ): Promise<AsyncGenerator<FlowSSEEvent>> {
    const self = this;

    async function* generate(): AsyncGenerator<FlowSSEEvent> {
      if (!sandbox) {
        yield {
          type: FlowSSEEventType.ERROR,
          permutationId: permutation.id,
          error: "No sandbox available for permutation",
        };
        return;
      }

      // Start recording
      sandbox.startRecording();

      const stepMap = new Map(flow.steps.map((s) => [s.id, s]));
      const orderedSteps = permutation.stepOrder
        .map((id) => stepMap.get(id))
        .filter((s): s is FlowStep => s !== undefined);

      const verificationResults: VerificationResult[] = [];
      let lastScreenshot = "";

      // Execute each step in order
      for (let i = 0; i < orderedSteps.length; i++) {
        const step = orderedSteps[i];

        if (signal.aborted) {
          yield {
            type: FlowSSEEventType.ERROR,
            permutationId: permutation.id,
            error: "Execution aborted",
          };
          break;
        }

        // Create step executor
        const executor = new FlowStepExecutor(
          sandbox,
          options.resolution,
          permutation.id
        );

        // Execute step and yield events
        for await (const event of executor.executeStep(step, signal)) {
          // Augment step events with index info
          if (event.type === FlowSSEEventType.STEP_STARTED) {
            yield {
              ...event,
              stepIndex: i,
              totalSteps: orderedSteps.length,
            };
          } else if (event.type === FlowSSEEventType.SCREENSHOT) {
            lastScreenshot = event.screenshot;
            yield event;
          } else {
            yield event;
          }
        }

        // Verify step completion
        const verifier = new ScreenshotVerifier();
        const verification = await verifier.verify(
          step,
          lastScreenshot,
          sandbox
        );
        verificationResults.push(verification);

        // Yield step completed
        yield {
          type: FlowSSEEventType.STEP_COMPLETED,
          permutationId: permutation.id,
          stepId: step.id,
          stepName: step.name,
          passed: verification.passed,
          verification,
        };

        // If step failed, optionally continue or stop
        if (!verification.passed) {
          logDebug(
            "ExecutionManager",
            `Step ${step.name} failed verification in permutation ${permutation.label}`
          );
        }
      }

      // Stop recording and save
      const recording = sandbox.stopRecording();
      await recordingStorage.save(executionId, recording);

      // Yield permutation completed
      const allPassed = allVerificationsPassed(verificationResults);
      yield {
        type: FlowSSEEventType.PERMUTATION_COMPLETED,
        permutationId: permutation.id,
        label: permutation.label,
        passed: allPassed,
        verificationResults,
      };
    }

    return generate();
  }

  /**
   * Merge multiple async generators into one
   */
  private async *mergeAsyncGenerators(
    generators: AsyncGenerator<FlowSSEEvent>[]
  ): AsyncGenerator<FlowSSEEvent> {
    // Use Promise.race to get events from any generator
    const iterators = generators.map((g) => ({
      generator: g,
      nextPromise: g.next(),
    }));

    while (iterators.length > 0) {
      // Wait for any iterator to have a value
      const results = await Promise.all(
        iterators.map(async (it, index) => {
          const result = await it.nextPromise;
          return { result, index };
        })
      );

      // Process results and remove done iterators
      const toRemove: number[] = [];

      for (const { result, index } of results) {
        if (result.done) {
          toRemove.push(index);
        } else {
          yield result.value;
          iterators[index].nextPromise = iterators[index].generator.next();
        }
      }

      // Remove completed iterators (in reverse order to maintain indices)
      toRemove.sort((a, b) => b - a);
      for (const index of toRemove) {
        iterators.splice(index, 1);
      }
    }
  }

  /**
   * Update execution result based on event
   */
  private updateExecutionResult(
    result: FlowExecutionResult,
    event: FlowSSEEvent
  ): void {
    if ("permutationId" in event && event.permutationId) {
      const perm = result.permutations.find(
        (p) => p.permutationId === event.permutationId
      );

      if (perm) {
        switch (event.type) {
          case FlowSSEEventType.STEP_STARTED:
            perm.status = "running";
            break;
          case FlowSSEEventType.PERMUTATION_COMPLETED:
            perm.status = "completed";
            perm.passed = event.passed;
            perm.verificationResults = event.verificationResults;
            perm.completedAt = new Date();
            break;
          case FlowSSEEventType.ERROR:
            perm.status = "failed";
            perm.error = event.error;
            break;
        }
      }
    }

    // Update summary
    result.summary = this.calculateSummary(result.permutations);
  }

  /**
   * Calculate summary from permutation results
   */
  private calculateSummary(
    permutations: PermutationResult[]
  ): FlowExecutionResult["summary"] {
    return {
      total: permutations.length,
      passed: permutations.filter((p) => p.status === "completed" && p.passed)
        .length,
      failed: permutations.filter(
        (p) => p.status === "failed" || (p.status === "completed" && !p.passed)
      ).length,
      running: permutations.filter((p) => p.status === "running").length,
      pending: permutations.filter((p) => p.status === "pending").length,
    };
  }

  /**
   * Get execution result by ID
   */
  getExecution(executionId: string): FlowExecutionResult | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Abort an execution
   */
  abortExecution(executionId: string): boolean {
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get all executions
   */
  getAllExecutions(): FlowExecutionResult[] {
    return Array.from(this.executions.values());
  }
}

// Global execution manager instance
export const executionManager = new FlowExecutionManager();
