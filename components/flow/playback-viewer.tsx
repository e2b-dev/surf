"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FlowRecording, FlowRecordingFrame } from "@/types/flow";
import { PlaybackController } from "@/lib/flow/recorder";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FastForward,
  Rewind,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface PlaybackViewerProps {
  recording: FlowRecording;
  className?: string;
}

export function PlaybackViewer({ recording, className }: PlaybackViewerProps) {
  const [currentFrame, setCurrentFrame] = React.useState<FlowRecordingFrame | null>(
    recording.frames[0] || null
  );
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackSpeed, setPlaybackSpeed] = React.useState(1);
  const controllerRef = React.useRef<PlaybackController | null>(null);

  React.useEffect(() => {
    const controller = new PlaybackController(recording);
    controller.setOnFrameChange((frame, index) => {
      setCurrentFrame(frame);
      setCurrentIndex(index);
    });
    controllerRef.current = controller;

    return () => {
      controller.pause();
    };
  }, [recording]);

  const handlePlay = () => {
    if (controllerRef.current) {
      if (isPlaying) {
        controllerRef.current.pause();
      } else {
        controllerRef.current.play(playbackSpeed);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handlePrevious = () => {
    controllerRef.current?.previous();
  };

  const handleNext = () => {
    controllerRef.current?.next();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    controllerRef.current?.seekTo(index);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlaying && controllerRef.current) {
      controllerRef.current.pause();
      controllerRef.current.play(speed);
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (!recording.frames.length) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-fg-300", className)}>
        No recording data available
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col rounded-sm border border-border overflow-hidden", className)}>
      {/* Screenshot view */}
      <div className="relative aspect-video bg-bg-200">
        {currentFrame?.screenshot ? (
          <img
            src={`data:image/png;base64,${currentFrame.screenshot}`}
            alt={`Frame ${currentIndex + 1}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-300">
            No screenshot
          </div>
        )}

        {/* Step indicator */}
        {currentFrame && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-sm bg-bg/80 backdrop-blur-sm">
            <span className="font-mono text-xs text-fg-300">
              Step: {currentFrame.stepName}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-border space-y-4">
        {/* Timeline slider */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-fg-300 w-12">
            {formatTime(currentFrame?.timestamp || 0)}
          </span>
          <input
            type="range"
            min={0}
            max={recording.frames.length - 1}
            value={currentIndex}
            onChange={handleSeek}
            className="flex-1 h-2 bg-bg-200 rounded-sm appearance-none cursor-pointer accent-accent"
          />
          <span className="font-mono text-xs text-fg-300 w-12 text-right">
            {formatTime(recording.totalDuration)}
          </span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => controllerRef.current?.seekTo(0)}
              title="Go to start"
            >
              <Rewind size={16} />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handlePrevious}
              title="Previous frame"
            >
              <SkipBack size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handlePlay}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleNext}
              title="Next frame"
            >
              <SkipForward size={16} />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => controllerRef.current?.seekTo(recording.frames.length - 1)}
              title="Go to end"
            >
              <FastForward size={16} />
            </Button>
          </div>

          {/* Speed controls */}
          <div className="flex items-center gap-1">
            {[0.5, 1, 2].map((speed) => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? "accent" : "ghost"}
                size="sm"
                onClick={() => handleSpeedChange(speed)}
              >
                {speed}x
              </Button>
            ))}
          </div>

          {/* Frame counter */}
          <span className="font-mono text-xs text-fg-300">
            {currentIndex + 1} / {recording.frames.length}
          </span>
        </div>

        {/* Current action/reasoning */}
        {(currentFrame?.action || currentFrame?.reasoning) && (
          <div className="space-y-2 text-sm">
            {currentFrame.action && (
              <div className="p-2 bg-bg-200 rounded-sm">
                <span className="font-mono text-xs text-fg-300">Action:</span>
                <pre className="mt-1 text-xs overflow-x-auto">
                  {JSON.stringify(currentFrame.action, null, 2)}
                </pre>
              </div>
            )}
            {currentFrame.reasoning && (
              <div className="p-2 bg-bg-200 rounded-sm">
                <span className="font-mono text-xs text-fg-300">Reasoning:</span>
                <p className="mt-1 text-fg-300">{currentFrame.reasoning}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
