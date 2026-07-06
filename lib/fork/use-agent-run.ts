"use client";

import { useCallback, useRef, useState } from "react";
import { SSEEventType } from "@/types/api";
import { ParsedSSEEvent } from "@/types/chat";
import { OpenAIComputerAction } from "@/types/openai";
import { logError } from "@/lib/logger";

export type AgentStatus = "idle" | "creating" | "running" | "done" | "error";

export interface AgentLogEntry {
  id: string;
  kind: "reasoning" | "action" | "system";
  text: string;
  status?: "pending" | "completed";
}

export interface RunAgentOptions {
  task: string;
  /** Existing sandbox to run against. Omit to have the backend create one. */
  sandboxId?: string;
  resolution: [number, number];
}

export interface AgentRun {
  status: AgentStatus;
  log: AgentLogEntry[];
  sandboxId: string | null;
  vncUrl: string | null;
  error: string | null;
  /** Runs the agent; resolves with the sandboxId once known (or null on failure). */
  run: (opts: RunAgentOptions) => Promise<string | null>;
  stop: () => void;
  reset: () => void;
}

/** Human-readable one-liner for a computer-use action, for the activity log. */
export function formatAction(action: OpenAIComputerAction): string {
  switch (action.type) {
    case "click":
      return `Click (${action.button}) at ${action.x}, ${action.y}`;
    case "double_click":
      return `Double-click at ${action.x}, ${action.y}`;
    case "move":
      return `Move to ${action.x}, ${action.y}`;
    case "scroll":
      return `Scroll ${action.scroll_y < 0 ? "up" : "down"}`;
    case "keypress":
      return `Press ${action.keys.join(" + ")}`;
    case "type":
      return `Type "${action.text.length > 40 ? action.text.slice(0, 40) + "…" : action.text}"`;
    case "wait":
      return "Wait";
    case "drag":
      return "Drag";
    case "screenshot":
      return "Screenshot";
    default:
      return (action as { type: string }).type;
  }
}

function parseSSEEvent(data: string): ParsedSSEEvent | null {
  try {
    const trimmed = data.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data: ")) {
      const json = trimmed.substring(6).trim();
      return json ? JSON.parse(json) : null;
    }
    const match = trimmed.match(/data: ({.*})/);
    if (match?.[1]) return JSON.parse(match[1]);
    return JSON.parse(trimmed);
  } catch (e) {
    logError("Error parsing SSE event (fork):", e);
    return null;
  }
}

/**
 * Drives a single computer-use agent against /api/chat and exposes a compact,
 * render-friendly view of its progress. Each fork pane owns one of these.
 */
export function useAgentRun(): AgentRun {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const idCounter = useRef(0);
  const nextId = () => `entry-${idCounter.current++}`;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setLog([]);
    setSandboxId(null);
    setVncUrl(null);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus((prev) => (prev === "running" || prev === "creating" ? "done" : prev));
  }, []);

  const run = useCallback(
    async ({ task, sandboxId: existingSandboxId, resolution }: RunAgentOptions) => {
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setLog([]);
      setStatus(existingSandboxId ? "running" : "creating");
      if (existingSandboxId) setSandboxId(existingSandboxId);

      let resolvedSandboxId = existingSandboxId ?? null;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: task }],
            sandboxId: existingSandboxId,
            environment: "linux",
            resolution,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (parsed: ParsedSSEEvent) => {
          switch (parsed.type) {
            case SSEEventType.SANDBOX_CREATED:
              if (parsed.sandboxId) {
                resolvedSandboxId = parsed.sandboxId;
                setSandboxId(parsed.sandboxId);
                setStatus("running");
              }
              if (parsed.vncUrl) setVncUrl(parsed.vncUrl);
              break;
            case SSEEventType.REASONING:
              if (typeof parsed.content === "string" && parsed.content.trim()) {
                setLog((prev) => [
                  ...prev,
                  { id: nextId(), kind: "reasoning", text: parsed.content },
                ]);
              }
              break;
            case SSEEventType.ACTION:
              if (parsed.action) {
                setLog((prev) => [
                  ...prev,
                  {
                    id: nextId(),
                    kind: "action",
                    text: formatAction(parsed.action as OpenAIComputerAction),
                    status: "pending",
                  },
                ]);
              }
              break;
            case SSEEventType.ACTION_COMPLETED:
              setLog((prev) => {
                const idx = [...prev]
                  .reverse()
                  .findIndex((e) => e.kind === "action" && e.status === "pending");
                if (idx === -1) return prev;
                const actualIdx = prev.length - 1 - idx;
                return prev.map((e, i) =>
                  i === actualIdx ? { ...e, status: "completed" } : e
                );
              });
              break;
            case SSEEventType.DONE:
              setStatus("done");
              break;
            case SSEEventType.ERROR:
              setError(typeof parsed.content === "string" ? parsed.content : "Agent error");
              setStatus("error");
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            if (!event.trim()) continue;
            const parsed = parseSSEEvent(event);
            if (parsed) handleEvent(parsed);
          }
        }

        // Flush any trailing event.
        if (buffer.trim()) {
          const parsed = parseSSEEvent(buffer);
          if (parsed) handleEvent(parsed);
        }

        setStatus((prev) => (prev === "error" ? prev : "done"));
      } catch (e) {
        if (controller.signal.aborted) {
          // Stopped intentionally — leave status as set by stop().
        } else {
          logError("Fork agent run failed:", e);
          setError(e instanceof Error ? e.message : "Agent run failed");
          setStatus("error");
        }
      }

      return resolvedSandboxId;
    },
    []
  );

  return { status, log, sandboxId, vncUrl, error, run, stop, reset };
}
