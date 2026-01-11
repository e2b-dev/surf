/**
 * RecordingSandbox - wraps E2B Sandbox to capture all actions
 */
import { Sandbox } from "@e2b/desktop";
import { FlowRecorder } from "./recorder";
import { ComputerAction } from "@/types/anthropic";

/**
 * RecordingSandbox wraps an E2B Sandbox and records all actions
 */
export class RecordingSandbox {
  public readonly sandbox: Sandbox;
  public readonly sandboxId: string;
  public readonly recorder: FlowRecorder;
  private vncUrl: string | null = null;

  constructor(sandbox: Sandbox, permutationId: string) {
    this.sandbox = sandbox;
    this.sandboxId = sandbox.sandboxId;
    this.recorder = new FlowRecorder(permutationId);
  }

  /**
   * Get the underlying sandbox
   */
  getSandbox(): Sandbox {
    return this.sandbox;
  }

  /**
   * Set the VNC URL after stream is started
   */
  setVncUrl(url: string): void {
    this.vncUrl = url;
  }

  /**
   * Get the VNC URL
   */
  getVncUrl(): string | null {
    return this.vncUrl;
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.recorder.startRecording();
  }

  /**
   * Stop recording and get the result
   */
  stopRecording() {
    return this.recorder.stopRecording();
  }

  /**
   * Take a screenshot and record it
   */
  async takeScreenshot(): Promise<string> {
    const screenshotData = await this.sandbox.screenshot();
    const screenshotBase64 = Buffer.from(screenshotData).toString("base64");
    this.recorder.captureScreenshot(screenshotBase64);
    return screenshotBase64;
  }

  /**
   * Left click at coordinates
   */
  async leftClick(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "left_click",
      coordinate: [x, y],
    };
    await this.sandbox.leftClick(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Right click at coordinates
   */
  async rightClick(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "right_click",
      coordinate: [x, y],
    };
    await this.sandbox.rightClick(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Middle click at coordinates
   */
  async middleClick(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "middle_click",
      coordinate: [x, y],
    };
    await this.sandbox.middleClick(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Double click at coordinates
   */
  async doubleClick(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "double_click",
      coordinate: [x, y],
    };
    await this.sandbox.doubleClick(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Triple click at coordinates
   */
  async tripleClick(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "triple_click",
      coordinate: [x, y],
    };
    // E2B may not support tripleClick - fall back to double click + single click
    await this.sandbox.doubleClick(x, y);
    await this.sandbox.leftClick(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Type text
   */
  async write(text: string): Promise<void> {
    const action: ComputerAction = {
      action: "type",
      text,
    };
    await this.sandbox.write(text);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Press key(s)
   */
  async press(keys: string): Promise<void> {
    const action: ComputerAction = {
      action: "key",
      text: keys,
    };
    await this.sandbox.press(keys);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Move mouse to coordinates
   */
  async moveMouse(x: number, y: number): Promise<void> {
    const action: ComputerAction = {
      action: "mouse_move",
      coordinate: [x, y],
    };
    await this.sandbox.moveMouse(x, y);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Scroll in a direction
   */
  async scroll(
    direction: "up" | "down",
    amount: number
  ): Promise<void> {
    const action: ComputerAction = {
      action: "scroll",
      coordinate: [0, 0],
      scroll_direction: direction,
      scroll_amount: amount,
    };
    await this.sandbox.scroll(direction, amount);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Drag from start to end coordinates
   */
  async drag(
    start: [number, number],
    end: [number, number]
  ): Promise<void> {
    const action: ComputerAction = {
      action: "left_click_drag",
      start_coordinate: start,
      coordinate: end,
    };
    await this.sandbox.drag(start, end);
    const screenshot = await this.takeScreenshotWithoutRecording();
    this.recorder.captureAction(action, screenshot);
  }

  /**
   * Run a command in the sandbox
   */
  async runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await this.sandbox.commands.run(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  /**
   * Record reasoning from AI
   */
  recordReasoning(reasoning: string): void {
    this.recorder.captureReasoning(reasoning);
  }

  /**
   * Set timeout for the sandbox
   */
  setTimeout(timeoutMs: number): void {
    this.sandbox.setTimeout(timeoutMs);
  }

  /**
   * Kill the sandbox
   */
  async kill(): Promise<void> {
    await this.sandbox.kill();
  }

  /**
   * Take screenshot without recording (internal use)
   */
  private async takeScreenshotWithoutRecording(): Promise<string> {
    const screenshotData = await this.sandbox.screenshot();
    return Buffer.from(screenshotData).toString("base64");
  }
}

/**
 * Create a RecordingSandbox with a new E2B Sandbox
 */
export async function createRecordingSandbox(
  permutationId: string,
  options: {
    resolution: [number, number];
    dpi?: number;
    timeoutMs?: number;
  }
): Promise<RecordingSandbox> {
  const sandbox = await Sandbox.create({
    resolution: options.resolution,
    dpi: options.dpi || 96,
    timeoutMs: options.timeoutMs || 300000,
  });

  // Start VNC stream
  await sandbox.stream.start();
  const vncUrl = sandbox.stream.getUrl();

  const recordingSandbox = new RecordingSandbox(sandbox, permutationId);
  recordingSandbox.setVncUrl(vncUrl);

  return recordingSandbox;
}
