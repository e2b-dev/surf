"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/loader";
import { AgentStatus, AgentLogEntry } from "@/lib/fork/use-agent-run";
import {
  CheckCircle2,
  CircleDashed,
  Cpu,
  Lock,
  MousePointerClick,
  XCircle,
} from "lucide-react";

interface AgentPaneProps {
  title: string;
  subtitle?: string;
  status: AgentStatus;
  log: AgentLogEntry[];
  vncUrl: string | null;
  error?: string | null;
  /** Show an "authenticated / inherited session" marker on the pane. */
  authenticated?: boolean;
  /** Dim + freeze the pane (e.g. the primary once it has been snapshotted). */
  frozen?: boolean;
  frozenLabel?: string;
  className?: string;
}

function StatusBadge({
  status,
  frozen,
  frozenLabel,
}: {
  status: AgentStatus;
  frozen?: boolean;
  frozenLabel?: string;
}) {
  if (frozen) {
    return (
      <Badge variant="accent" className="gap-1">
        <Lock className="w-3 h-3" />
        {frozenLabel ?? "Snapshotted"}
      </Badge>
    );
  }

  switch (status) {
    case "creating":
      return (
        <Badge variant="muted" className="gap-1">
          <Loader className="text-fg-500" /> Booting
        </Badge>
      );
    case "running":
      return (
        <Badge variant="warning" className="gap-1">
          <Loader className="text-warning" /> Working
        </Badge>
      );
    case "done":
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="w-3 h-3" /> Done
        </Badge>
      );
    case "error":
      return (
        <Badge variant="error" className="gap-1">
          <XCircle className="w-3 h-3" /> Error
        </Badge>
      );
    default:
      return (
        <Badge variant="muted" className="gap-1">
          <CircleDashed className="w-3 h-3" /> Idle
        </Badge>
      );
  }
}

function LogRow({ entry }: { entry: AgentLogEntry }) {
  if (entry.kind === "reasoning") {
    return (
      <p className="flex gap-2 text-fg-300 leading-snug">
        <Cpu className="w-3 h-3 mt-0.5 shrink-0 text-accent" />
        <span className="line-clamp-3">{entry.text}</span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        "flex gap-2 items-center leading-snug",
        entry.status === "completed" ? "text-fg-400" : "text-fg-200"
      )}
    >
      <MousePointerClick
        className={cn(
          "w-3 h-3 shrink-0",
          entry.status === "completed" ? "text-success" : "text-warning"
        )}
      />
      <span className="truncate">{entry.text}</span>
    </p>
  );
}

/**
 * A single agent's live view: VNC stream on top, scrolling activity log below.
 * Used for both the primary authenticated agent and each fork.
 */
export function AgentPane({
  title,
  subtitle,
  status,
  log,
  vncUrl,
  error,
  authenticated,
  frozen,
  frozenLabel,
  className,
}: AgentPaneProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xs border bg-bg",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{title}</span>
            {authenticated && (
              <Lock
                className="w-3 h-3 text-accent shrink-0"
                aria-label="Authenticated session"
              />
            )}
          </div>
          {subtitle && (
            <p className="truncate text-xs text-fg-500">{subtitle}</p>
          )}
        </div>
        <StatusBadge status={status} frozen={frozen} frozenLabel={frozenLabel} />
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg-200">
        {vncUrl ? (
          <iframe
            src={vncUrl}
            className={cn(
              "h-full w-full transition-opacity",
              frozen && "opacity-60"
            )}
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-500">
            <Loader variant="square" className="text-accent" />
            <span className="text-xs">
              {status === "creating" ? "Booting sandbox…" : "Waiting…"}
            </span>
          </div>
        )}
        {frozen && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/30 backdrop-blur-[1px]">
            <Badge variant="accent" className="gap-1 shadow-sm">
              <Lock className="w-3 h-3" />
              {frozenLabel ?? "Snapshot captured — paused"}
            </Badge>
          </div>
        )}
      </div>

      <div
        ref={logRef}
        className="h-28 shrink-0 space-y-1 overflow-y-auto px-2.5 py-2 text-xs font-mono"
      >
        {error ? (
          <p className="text-error">{error}</p>
        ) : log.length === 0 ? (
          <p className="text-fg-500">No activity yet.</p>
        ) : (
          log.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
