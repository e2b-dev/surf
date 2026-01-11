/**
 * VM Pool - manages multiple E2B sandboxes in parallel
 */
import { RecordingSandbox, createRecordingSandbox } from "./sandbox-wrapper";
import { logDebug, logError } from "../logger";

export interface VMPoolOptions {
  maxConcurrent: number;
  resolution: [number, number];
  dpi?: number;
  timeoutMs?: number;
}

/**
 * VMPool manages a pool of RecordingSandbox instances
 */
export class VMPool {
  private sandboxes: Map<string, RecordingSandbox> = new Map();
  private maxConcurrent: number;
  private resolution: [number, number];
  private dpi: number;
  private timeoutMs: number;

  constructor(options: VMPoolOptions) {
    this.maxConcurrent = options.maxConcurrent;
    this.resolution = options.resolution;
    this.dpi = options.dpi || 96;
    this.timeoutMs = options.timeoutMs || 300000;
  }

  /**
   * Acquire multiple sandboxes for permutations
   */
  async acquire(
    permutationIds: string[]
  ): Promise<Map<string, RecordingSandbox>> {
    const count = Math.min(permutationIds.length, this.maxConcurrent);
    const sandboxPromises: Promise<RecordingSandbox>[] = [];

    logDebug("VMPool", `Acquiring ${count} sandboxes...`);

    for (let i = 0; i < count; i++) {
      const permutationId = permutationIds[i];
      sandboxPromises.push(
        createRecordingSandbox(permutationId, {
          resolution: this.resolution,
          dpi: this.dpi,
          timeoutMs: this.timeoutMs,
        })
      );
    }

    const results = await Promise.allSettled(sandboxPromises);
    const acquired = new Map<string, RecordingSandbox>();

    results.forEach((result, index) => {
      const permutationId = permutationIds[index];
      if (result.status === "fulfilled") {
        const sandbox = result.value;
        this.sandboxes.set(permutationId, sandbox);
        acquired.set(permutationId, sandbox);
        logDebug(
          "VMPool",
          `Sandbox ${sandbox.sandboxId} acquired for permutation ${permutationId}`
        );
      } else {
        logError(
          "VMPool",
          `Failed to create sandbox for permutation ${permutationId}:`,
          result.reason
        );
      }
    });

    return acquired;
  }

  /**
   * Get a sandbox by permutation ID
   */
  get(permutationId: string): RecordingSandbox | undefined {
    return this.sandboxes.get(permutationId);
  }

  /**
   * Release a sandbox
   */
  async release(permutationId: string): Promise<void> {
    const sandbox = this.sandboxes.get(permutationId);
    if (sandbox) {
      try {
        await sandbox.kill();
        logDebug(
          "VMPool",
          `Sandbox ${sandbox.sandboxId} released for permutation ${permutationId}`
        );
      } catch (error) {
        logError("VMPool", `Error killing sandbox:`, error);
      }
      this.sandboxes.delete(permutationId);
    }
  }

  /**
   * Release all sandboxes
   */
  async releaseAll(): Promise<void> {
    const releasePromises: Promise<void>[] = [];

    for (const [permutationId] of this.sandboxes) {
      releasePromises.push(this.release(permutationId));
    }

    await Promise.allSettled(releasePromises);
    this.sandboxes.clear();
    logDebug("VMPool", "All sandboxes released");
  }

  /**
   * Get count of active sandboxes
   */
  getActiveCount(): number {
    return this.sandboxes.size;
  }

  /**
   * Get all active sandbox IDs
   */
  getActivePermutationIds(): string[] {
    return Array.from(this.sandboxes.keys());
  }

  /**
   * Check if a sandbox exists for a permutation
   */
  has(permutationId: string): boolean {
    return this.sandboxes.has(permutationId);
  }

  /**
   * Get all sandboxes as array
   */
  getAll(): RecordingSandbox[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Get all sandboxes with their permutation IDs
   */
  getAllWithIds(): Array<{ permutationId: string; sandbox: RecordingSandbox }> {
    return Array.from(this.sandboxes.entries()).map(
      ([permutationId, sandbox]) => ({
        permutationId,
        sandbox,
      })
    );
  }
}
