/**
 * Flow recording system - captures screenshots, actions, and reasoning
 */
import {
  FlowRecording,
  FlowRecordingFrame,
  FlowStep,
} from "@/types/flow";
import { ComputerAction } from "@/types/anthropic";
import { v4 as uuidv4 } from "uuid";

/**
 * FlowRecorder captures all frames during flow execution
 */
export class FlowRecorder {
  private permutationId: string;
  private frames: FlowRecordingFrame[] = [];
  private startTime: number = 0;
  private isRecording: boolean = false;
  private currentStepId: string = "";
  private currentStepName: string = "";
  private stepBoundaries: Map<
    string,
    { startTime: number; endTime: number }
  > = new Map();

  constructor(permutationId: string) {
    this.permutationId = permutationId;
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.startTime = Date.now();
    this.isRecording = true;
    this.frames = [];
    this.stepBoundaries.clear();
  }

  /**
   * Stop recording and return the complete recording
   */
  stopRecording(): FlowRecording {
    this.isRecording = false;

    // Close any open step boundary
    if (this.currentStepId && this.stepBoundaries.has(this.currentStepId)) {
      const boundary = this.stepBoundaries.get(this.currentStepId)!;
      boundary.endTime = Date.now() - this.startTime;
    }

    const totalDuration = Date.now() - this.startTime;

    return {
      permutationId: this.permutationId,
      frames: this.frames,
      totalDuration,
      stepBoundaries: Array.from(this.stepBoundaries.entries()).map(
        ([stepId, { startTime, endTime }]) => ({
          stepId,
          startTime,
          endTime,
        })
      ),
    };
  }

  /**
   * Set the current step being executed
   */
  setCurrentStep(step: FlowStep): void {
    // Close previous step boundary
    if (this.currentStepId && this.stepBoundaries.has(this.currentStepId)) {
      const boundary = this.stepBoundaries.get(this.currentStepId)!;
      boundary.endTime = Date.now() - this.startTime;
    }

    this.currentStepId = step.id;
    this.currentStepName = step.name;

    // Start new step boundary
    this.stepBoundaries.set(step.id, {
      startTime: Date.now() - this.startTime,
      endTime: 0,
    });
  }

  /**
   * Capture a frame with screenshot
   */
  captureScreenshot(screenshot: string): FlowRecordingFrame {
    const frame = this.createFrame({ screenshot });
    this.frames.push(frame);
    return frame;
  }

  /**
   * Capture a frame with action
   */
  captureAction(action: ComputerAction, screenshot?: string): FlowRecordingFrame {
    const frame = this.createFrame({ action, screenshot });
    this.frames.push(frame);
    return frame;
  }

  /**
   * Capture reasoning text
   */
  captureReasoning(reasoning: string): FlowRecordingFrame {
    const frame = this.createFrame({ reasoning });
    this.frames.push(frame);
    return frame;
  }

  /**
   * Capture a complete frame with all data
   */
  captureFrame(data: {
    screenshot?: string;
    action?: ComputerAction;
    reasoning?: string;
  }): FlowRecordingFrame {
    const frame = this.createFrame(data);
    this.frames.push(frame);
    return frame;
  }

  /**
   * Get current frame count
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Get all frames (for streaming)
   */
  getFrames(): FlowRecordingFrame[] {
    return [...this.frames];
  }

  /**
   * Get the last frame
   */
  getLastFrame(): FlowRecordingFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  /**
   * Check if recording is active
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get elapsed time since recording started
   */
  getElapsedTime(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Create a frame with current timestamp and step info
   */
  private createFrame(data: {
    screenshot?: string;
    action?: ComputerAction;
    reasoning?: string;
  }): FlowRecordingFrame {
    return {
      frameId: uuidv4(),
      timestamp: Date.now() - this.startTime,
      screenshot: data.screenshot || "",
      action: data.action,
      reasoning: data.reasoning,
      stepId: this.currentStepId,
      stepName: this.currentStepName,
    };
  }
}

/**
 * PlaybackController for navigating through recordings
 */
export class PlaybackController {
  private recording: FlowRecording;
  private currentIndex: number = 0;
  private playbackSpeed: number = 1;
  private isPlaying: boolean = false;
  private playbackTimer: NodeJS.Timeout | null = null;
  private onFrameChange?: (frame: FlowRecordingFrame, index: number) => void;

  constructor(recording: FlowRecording) {
    this.recording = recording;
  }

  /**
   * Set callback for frame changes
   */
  setOnFrameChange(
    callback: (frame: FlowRecordingFrame, index: number) => void
  ): void {
    this.onFrameChange = callback;
  }

  /**
   * Go to next frame
   */
  next(): FlowRecordingFrame | null {
    if (this.currentIndex < this.recording.frames.length - 1) {
      this.currentIndex++;
      this.notifyFrameChange();
      return this.getCurrentFrame();
    }
    return null;
  }

  /**
   * Go to previous frame
   */
  previous(): FlowRecordingFrame | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notifyFrameChange();
      return this.getCurrentFrame();
    }
    return null;
  }

  /**
   * Seek to specific frame index
   */
  seekTo(frameIndex: number): FlowRecordingFrame {
    this.currentIndex = Math.max(
      0,
      Math.min(frameIndex, this.recording.frames.length - 1)
    );
    this.notifyFrameChange();
    return this.getCurrentFrame();
  }

  /**
   * Seek to specific timestamp
   */
  seekToTime(timestamp: number): FlowRecordingFrame {
    // Find the frame closest to the timestamp
    let closestIndex = 0;
    let closestDiff = Infinity;

    for (let i = 0; i < this.recording.frames.length; i++) {
      const diff = Math.abs(this.recording.frames[i].timestamp - timestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    return this.seekTo(closestIndex);
  }

  /**
   * Start playback at specified speed
   */
  play(speed: number = 1): void {
    this.playbackSpeed = speed;
    this.isPlaying = true;
    this.scheduleNextFrame();
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    this.pause();
    this.currentIndex = 0;
    this.notifyFrameChange();
  }

  /**
   * Get current frame
   */
  getCurrentFrame(): FlowRecordingFrame {
    return this.recording.frames[this.currentIndex];
  }

  /**
   * Get current frame index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get total number of frames
   */
  getTotalFrames(): number {
    return this.recording.frames.length;
  }

  /**
   * Get total duration in ms
   */
  getDuration(): number {
    return this.recording.totalDuration;
  }

  /**
   * Get current timestamp
   */
  getCurrentTimestamp(): number {
    return this.recording.frames[this.currentIndex]?.timestamp || 0;
  }

  /**
   * Check if playback is active
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get step boundaries for timeline markers
   */
  getStepBoundaries(): FlowRecording["stepBoundaries"] {
    return this.recording.stepBoundaries;
  }

  /**
   * Get frames for a specific step
   */
  getFramesForStep(stepId: string): FlowRecordingFrame[] {
    return this.recording.frames.filter((f) => f.stepId === stepId);
  }

  /**
   * Schedule the next frame during playback
   */
  private scheduleNextFrame(): void {
    if (!this.isPlaying) return;
    if (this.currentIndex >= this.recording.frames.length - 1) {
      this.pause();
      return;
    }

    const currentFrame = this.recording.frames[this.currentIndex];
    const nextFrame = this.recording.frames[this.currentIndex + 1];
    const delay = (nextFrame.timestamp - currentFrame.timestamp) / this.playbackSpeed;

    this.playbackTimer = setTimeout(() => {
      this.next();
      this.scheduleNextFrame();
    }, Math.max(delay, 16)); // Minimum 16ms (60fps)
  }

  /**
   * Notify frame change callback
   */
  private notifyFrameChange(): void {
    if (this.onFrameChange) {
      this.onFrameChange(this.getCurrentFrame(), this.currentIndex);
    }
  }
}

/**
 * In-memory storage for recordings (could be extended to use Vercel KV)
 */
export class RecordingStorage {
  private recordings: Map<string, FlowRecording> = new Map();

  /**
   * Save a recording
   */
  async save(executionId: string, recording: FlowRecording): Promise<void> {
    this.recordings.set(
      `${executionId}:${recording.permutationId}`,
      recording
    );
  }

  /**
   * Get a recording
   */
  async get(
    executionId: string,
    permutationId: string
  ): Promise<FlowRecording | null> {
    return this.recordings.get(`${executionId}:${permutationId}`) || null;
  }

  /**
   * Get all recordings for an execution
   */
  async getAllForExecution(executionId: string): Promise<FlowRecording[]> {
    const recordings: FlowRecording[] = [];
    for (const [key, recording] of this.recordings) {
      if (key.startsWith(`${executionId}:`)) {
        recordings.push(recording);
      }
    }
    return recordings;
  }

  /**
   * Delete a recording
   */
  async delete(executionId: string, permutationId: string): Promise<void> {
    this.recordings.delete(`${executionId}:${permutationId}`);
  }

  /**
   * Delete all recordings for an execution
   */
  async deleteAllForExecution(executionId: string): Promise<void> {
    for (const key of this.recordings.keys()) {
      if (key.startsWith(`${executionId}:`)) {
        this.recordings.delete(key);
      }
    }
  }
}

// Global storage instance
export const recordingStorage = new RecordingStorage();
