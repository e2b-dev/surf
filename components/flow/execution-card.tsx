"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PermutationResult, PermutationStatus } from "@/types/flow";
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Spinner,
} from "@phosphor-icons/react";

interface ExecutionCardProps {
  permutation: PermutationResult;
  isActive?: boolean;
  onClick?: () => void;
}

const statusConfig: Record<
  PermutationStatus,
  { icon: React.ElementType; color: string; label: string }
> = {
  pending: { icon: Clock, color: "text-fg-300", label: "Pending" },
  running: { icon: Spinner, color: "text-accent", label: "Running" },
  verifying: { icon: Spinner, color: "text-warning", label: "Verifying" },
  completed: { icon: CheckCircle, color: "text-success", label: "Completed" },
  failed: { icon: XCircle, color: "text-error", label: "Failed" },
};

export function ExecutionCard({
  permutation,
  isActive,
  onClick,
}: ExecutionCardProps) {
  const config = statusConfig[permutation.status];
  const Icon = config.icon;
  const isRunning = permutation.status === "running" || permutation.status === "verifying";

  return (
    <div
      className={cn(
        "flex flex-col rounded-sm border border-border overflow-hidden cursor-pointer",
        "transition-all duration-200",
        isActive && "ring-2 ring-accent",
        "hover:border-fg-300"
      )}
      onClick={onClick}
    >
      {/* VNC View / Screenshot */}
      <div className="relative aspect-video bg-bg-200">
        {permutation.vncUrl && isRunning ? (
          <iframe
            src={permutation.vncUrl}
            className="w-full h-full border-0"
            title={`VM ${permutation.label}`}
          />
        ) : permutation.recording?.frames?.length > 0 ? (
          <img
            src={`data:image/png;base64,${permutation.recording.frames[permutation.recording.frames.length - 1]?.screenshot}`}
            alt="Last screenshot"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-300">
            <Play size={32} />
          </div>
        )}

        {/* Status overlay */}
        <div
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-sm",
            "bg-bg/80 backdrop-blur-sm text-xs font-mono uppercase"
          )}
        >
          <Icon
            size={14}
            className={cn(config.color, isRunning && "animate-spin")}
          />
          <span className={config.color}>{config.label}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">
            {permutation.label}
          </span>
          {permutation.status === "completed" && (
            <span
              className={cn(
                "text-xs font-mono",
                permutation.passed ? "text-success" : "text-error"
              )}
            >
              {permutation.passed ? "PASSED" : "FAILED"}
            </span>
          )}
        </div>

        {/* Verification summary */}
        {permutation.verificationResults.length > 0 && (
          <div className="mt-2 flex gap-1">
            {permutation.verificationResults.map((v, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full",
                  v.passed ? "bg-success" : "bg-error"
                )}
                title={`Step ${i + 1}: ${v.passed ? "Passed" : "Failed"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
