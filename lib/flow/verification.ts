/**
 * Verification system - AI-based verification of expected states
 */
import Anthropic from "@anthropic-ai/sdk";
import { ExpectedState, VerificationResult, FlowStep } from "@/types/flow";
import { RecordingSandbox } from "./sandbox-wrapper";
import { logDebug, logError } from "../logger";

/**
 * ScreenshotVerifier uses AI to verify expected states from screenshots
 */
export class ScreenshotVerifier {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Verify a step's expected state
   */
  async verify(
    step: FlowStep,
    screenshot: string,
    sandbox?: RecordingSandbox
  ): Promise<VerificationResult> {
    const expectedState = step.expectedState;

    switch (expectedState.type) {
      case "screenshot":
        return this.verifyScreenshot(step.id, screenshot, expectedState);
      case "file":
        if (sandbox) {
          return this.verifyFile(step.id, sandbox, expectedState);
        }
        // Fallback to screenshot verification if no sandbox
        return this.verifyScreenshot(step.id, screenshot, {
          type: "screenshot",
          screenshotPrompt: `Verify that a file operation completed successfully`,
        });
      case "process":
        if (sandbox) {
          return this.verifyProcess(step.id, sandbox, expectedState);
        }
        return {
          stepId: step.id,
          passed: false,
          confidence: 0,
          reasoning: "Cannot verify process without sandbox access",
        };
      default:
        return {
          stepId: step.id,
          passed: false,
          confidence: 0,
          reasoning: `Unknown verification type: ${expectedState.type}`,
        };
    }
  }

  /**
   * Verify using AI screenshot analysis
   */
  private async verifyScreenshot(
    stepId: string,
    screenshot: string,
    expectedState: ExpectedState
  ): Promise<VerificationResult> {
    if (!expectedState.screenshotPrompt) {
      return {
        stepId,
        passed: true,
        confidence: 0.5,
        reasoning: "No screenshot verification prompt provided, assuming success",
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: `You are a verification assistant. Analyze the screenshot and determine if the expected state is met.

Respond with a JSON object in this exact format:
{
  "passed": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "Your explanation"
}

Be strict but fair. If the expected state is clearly visible, mark it as passed.
If there are errors, loading states, or the expected state is not visible, mark it as failed.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Verify: ${expectedState.screenshotPrompt}`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: screenshot,
                },
              },
            ],
          },
        ],
      });

      // Extract text content from response
      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";

      // Parse JSON response
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            stepId,
            passed: Boolean(parsed.passed),
            confidence: Number(parsed.confidence) || 0.5,
            reasoning: String(parsed.reasoning) || "No reasoning provided",
          };
        }
      } catch (parseError) {
        logError("ScreenshotVerifier", "Failed to parse AI response:", parseError);
      }

      // Fallback parsing
      const passed = content.toLowerCase().includes('"passed": true') ||
        content.toLowerCase().includes('"passed":true');

      return {
        stepId,
        passed,
        confidence: 0.5,
        reasoning: content,
      };
    } catch (error) {
      logError("ScreenshotVerifier", error);
      return {
        stepId,
        passed: false,
        confidence: 0,
        reasoning: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Verify file existence and content
   */
  private async verifyFile(
    stepId: string,
    sandbox: RecordingSandbox,
    expectedState: ExpectedState
  ): Promise<VerificationResult> {
    if (!expectedState.filePath) {
      return {
        stepId,
        passed: false,
        confidence: 0,
        reasoning: "No file path specified for verification",
      };
    }

    try {
      // Check if file/directory exists
      const lsResult = await sandbox.runCommand(
        `ls -la "${expectedState.filePath}" 2>/dev/null || echo "NOT_FOUND"`
      );

      if (lsResult.stdout.includes("NOT_FOUND")) {
        // Try to check if it's a directory with matching files
        const findResult = await sandbox.runCommand(
          `find "${expectedState.filePath}" -type f 2>/dev/null | head -5`
        );

        if (!findResult.stdout.trim()) {
          return {
            stepId,
            passed: false,
            confidence: 0.9,
            reasoning: `File or directory not found: ${expectedState.filePath}`,
          };
        }
      }

      // If we need to check content
      if (expectedState.fileContains) {
        // Check if it's a directory or file
        const isDir = lsResult.stdout.startsWith("d") ||
          lsResult.stdout.includes("total ");

        let grepResult;
        if (isDir) {
          // Search for content in directory
          grepResult = await sandbox.runCommand(
            `grep -r "${expectedState.fileContains}" "${expectedState.filePath}" 2>/dev/null | head -1`
          );
        } else {
          // Search in specific file
          grepResult = await sandbox.runCommand(
            `grep "${expectedState.fileContains}" "${expectedState.filePath}" 2>/dev/null`
          );
        }

        if (!grepResult.stdout.trim()) {
          return {
            stepId,
            passed: false,
            confidence: 0.8,
            reasoning: `File exists but does not contain expected content: "${expectedState.fileContains}"`,
          };
        }

        return {
          stepId,
          passed: true,
          confidence: 0.95,
          reasoning: `File found and contains expected content: "${expectedState.fileContains}"`,
          details: {
            matchedContent: grepResult.stdout.substring(0, 200),
          },
        };
      }

      return {
        stepId,
        passed: true,
        confidence: 0.9,
        reasoning: `File or directory exists: ${expectedState.filePath}`,
      };
    } catch (error) {
      logError("ScreenshotVerifier", error);
      return {
        stepId,
        passed: false,
        confidence: 0,
        reasoning: `File verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Verify process is running
   */
  private async verifyProcess(
    stepId: string,
    sandbox: RecordingSandbox,
    expectedState: ExpectedState
  ): Promise<VerificationResult> {
    if (!expectedState.processName) {
      return {
        stepId,
        passed: false,
        confidence: 0,
        reasoning: "No process name specified for verification",
      };
    }

    try {
      const result = await sandbox.runCommand(
        `pgrep -f "${expectedState.processName}" || echo "NOT_RUNNING"`
      );

      if (result.stdout.includes("NOT_RUNNING") || !result.stdout.trim()) {
        return {
          stepId,
          passed: false,
          confidence: 0.9,
          reasoning: `Process not running: ${expectedState.processName}`,
        };
      }

      return {
        stepId,
        passed: true,
        confidence: 0.95,
        reasoning: `Process is running: ${expectedState.processName}`,
        details: {
          pids: result.stdout.trim().split("\n"),
        },
      };
    } catch (error) {
      logError("ScreenshotVerifier", error);
      return {
        stepId,
        passed: false,
        confidence: 0,
        reasoning: `Process verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

/**
 * Verify all steps in a permutation result
 */
export async function verifyPermutation(
  steps: FlowStep[],
  finalScreenshot: string,
  sandbox?: RecordingSandbox
): Promise<VerificationResult[]> {
  const verifier = new ScreenshotVerifier();
  const results: VerificationResult[] = [];

  for (const step of steps) {
    const result = await verifier.verify(step, finalScreenshot, sandbox);
    results.push(result);
    logDebug("Verification", `Step ${step.name}: ${result.passed ? "PASSED" : "FAILED"} (${result.confidence * 100}%)`);
  }

  return results;
}

/**
 * Check if all verifications passed
 */
export function allVerificationsPassed(results: VerificationResult[]): boolean {
  return results.every((r) => r.passed);
}

/**
 * Get summary of verification results
 */
export function getVerificationSummary(
  results: VerificationResult[]
): { passed: number; failed: number; total: number } {
  const passed = results.filter((r) => r.passed).length;
  return {
    passed,
    failed: results.length - passed,
    total: results.length,
  };
}
