"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PermutationResult, PermutationStatus } from "@/types/flow";
import {
  CheckCircle,
  XCircle,
  Clock,
  Desktop,
  Spinner,
  ArrowsOut,
  X,
} from "@phosphor-icons/react";

interface VMViewerProps {
  permutations: PermutationResult[];
  onSelectPermutation?: (permutationId: string) => void;
}

const statusConfig: Record<
  PermutationStatus,
  { color: string; bgColor: string; glowColor: string; label: string }
> = {
  pending: {
    color: "text-fg-300",
    bgColor: "bg-fg-300/10",
    glowColor: "",
    label: "Pending",
  },
  running: {
    color: "text-accent",
    bgColor: "bg-accent/10",
    glowColor: "shadow-[0_0_30px_rgba(99,102,241,0.4)]",
    label: "Running",
  },
  verifying: {
    color: "text-warning",
    bgColor: "bg-warning/10",
    glowColor: "shadow-[0_0_30px_rgba(234,179,8,0.4)]",
    label: "Verifying",
  },
  completed: {
    color: "text-success",
    bgColor: "bg-success/10",
    glowColor: "shadow-[0_0_20px_rgba(34,197,94,0.3)]",
    label: "Completed",
  },
  failed: {
    color: "text-error",
    bgColor: "bg-error/10",
    glowColor: "shadow-[0_0_20px_rgba(239,68,68,0.3)]",
    label: "Failed",
  },
};

function VMCard({
  permutation,
  index,
  onExpand,
}: {
  permutation: PermutationResult;
  index: number;
  onExpand: () => void;
}) {
  const config = statusConfig[permutation.status];
  const isRunning =
    permutation.status === "running" || permutation.status === "verifying";
  const hasVNC = permutation.vncUrl && isRunning;

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border overflow-hidden",
        "transition-all duration-500 ease-out",
        "hover:scale-[1.02] hover:z-10",
        config.glowColor,
        // Staggered entry animation
        "animate-in fade-in slide-in-from-bottom-4",
      )}
      style={{
        animationDelay: `${index * 100}ms`,
        animationFillMode: "backwards",
      }}
    >
      {/* Header bar with label and status */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2",
          "border-b border-border bg-bg-200/50 backdrop-blur-sm"
        )}
      >
        <div className="flex items-center gap-2">
          <Desktop size={16} className={config.color} />
          <span className="font-mono text-sm font-medium">
            {permutation.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono",
              config.bgColor,
              config.color
            )}
          >
            {isRunning && (
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    permutation.status === "running"
                      ? "bg-accent"
                      : "bg-warning"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    permutation.status === "running"
                      ? "bg-accent"
                      : "bg-warning"
                  )}
                />
              </span>
            )}
            {permutation.status === "completed" && (
              <CheckCircle size={12} weight="fill" />
            )}
            {permutation.status === "failed" && (
              <XCircle size={12} weight="fill" />
            )}
            {permutation.status === "pending" && <Clock size={12} />}
            <span className="uppercase tracking-wider">{config.label}</span>
          </div>
          {/* Expand button */}
          {hasVNC && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="p-1 rounded hover:bg-bg-300 transition-colors"
              title="Expand"
            >
              <ArrowsOut size={14} className="text-fg-300" />
            </button>
          )}
        </div>
      </div>

      {/* VNC iframe or placeholder */}
      <div className="relative aspect-video bg-bg-300">
        {hasVNC ? (
          <>
            <iframe
              src={permutation.vncUrl}
              className="w-full h-full border-0"
              title={`VM ${permutation.label}`}
              allow="clipboard-read; clipboard-write"
            />
            {/* Scanline effect for fun */}
            <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]" />
          </>
        ) : permutation.status === "pending" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-fg-300">
            <div className="relative">
              <Desktop size={48} className="opacity-30" />
              <Clock
                size={20}
                className="absolute -bottom-1 -right-1 text-fg-300"
              />
            </div>
            <span className="text-xs font-mono uppercase tracking-wider opacity-50">
              Waiting to start
            </span>
          </div>
        ) : permutation.recording?.frames?.length > 0 ? (
          <img
            src={`data:image/png;base64,${permutation.recording.frames[permutation.recording.frames.length - 1]?.screenshot}`}
            alt="Last screenshot"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-fg-300">
            <Spinner size={32} className="animate-spin opacity-50" />
            <span className="text-xs font-mono uppercase tracking-wider opacity-50">
              Initializing VM
            </span>
          </div>
        )}
      </div>

      {/* Progress bar for steps */}
      {permutation.verificationResults.length > 0 && (
        <div className="flex gap-0.5 p-2 bg-bg-200/50">
          {permutation.verificationResults.map((v, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 h-1 rounded-full transition-all duration-300",
                v.passed ? "bg-success" : "bg-error"
              )}
              title={`Step ${i + 1}: ${v.passed ? "Passed" : "Failed"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExpandedVMModal({
  permutation,
  onClose,
}: {
  permutation: PermutationResult;
  onClose: () => void;
}) {
  const config = statusConfig[permutation.status];

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-[90vw] h-[85vh] rounded-lg border border-border overflow-hidden",
          "bg-bg animate-in zoom-in-95 duration-300",
          config.glowColor
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-200">
          <div className="flex items-center gap-3">
            <Desktop size={20} className={config.color} />
            <span className="font-mono text-lg font-medium">
              {permutation.label}
            </span>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono",
                config.bgColor,
                config.color
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="uppercase tracking-wider">{config.label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Full VNC view */}
        <div className="relative h-[calc(100%-56px)]">
          {permutation.vncUrl ? (
            <>
              <iframe
                src={permutation.vncUrl}
                className="w-full h-full border-0"
                title={`VM ${permutation.label} - Expanded`}
                allow="clipboard-read; clipboard-write"
              />
              <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.02)_2px,rgba(0,0,0,0.02)_4px)]" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg-300">
              <span className="font-mono">No VNC available</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VMViewer({ permutations, onSelectPermutation }: VMViewerProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const expandedPerm = permutations.find((p) => p.permutationId === expandedId);

  // Count running VMs
  const runningCount = permutations.filter(
    (p) => p.status === "running" || p.status === "verifying"
  ).length;

  return (
    <div className="space-y-4">
      {/* Header with live count */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm text-fg-300 uppercase tracking-wider">
            Virtual Machines
          </h3>
          {runningCount > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              {runningCount} LIVE
            </div>
          )}
        </div>
        <span className="text-xs font-mono text-fg-300">
          {permutations.length} VMs
        </span>
      </div>

      {/* VM Grid */}
      <div
        className={cn(
          "grid gap-4",
          permutations.length <= 2 && "grid-cols-1 md:grid-cols-2",
          permutations.length >= 3 &&
            permutations.length <= 4 &&
            "grid-cols-2",
          permutations.length >= 5 &&
            permutations.length <= 6 &&
            "grid-cols-2 lg:grid-cols-3",
          permutations.length > 6 && "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        )}
      >
        {permutations.map((perm, index) => (
          <VMCard
            key={perm.permutationId}
            permutation={perm}
            index={index}
            onExpand={() => setExpandedId(perm.permutationId)}
          />
        ))}
      </div>

      {/* Expanded modal */}
      {expandedPerm && (
        <ExpandedVMModal
          permutation={expandedPerm}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  );
}
