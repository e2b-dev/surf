"use client";

import * as React from "react";
import {
  FlowDefinition,
  FlowExecutionResult,
  FlowSSEEvent,
  FlowSSEEventType,
  PermutationResult,
  FlowRecording,
} from "@/types/flow";

interface FlowContextState {
  // Flow data
  flows: FlowDefinition[];
  selectedFlow: FlowDefinition | null;

  // Execution state
  isExecuting: boolean;
  currentExecution: FlowExecutionResult | null;
  executionError: string | null;

  // Playback state
  selectedPermutationId: string | null;
  selectedRecording: FlowRecording | null;

  // Actions
  loadFlows: () => Promise<void>;
  selectFlow: (flowId: string) => void;
  executeFlow: (options?: {
    permutations?: "all" | string[];
    maxParallel?: number;
  }) => Promise<void>;
  cancelExecution: () => void;
  selectPermutation: (permutationId: string) => void;
  loadRecording: (executionId: string, permutationId: string) => Promise<void>;
}

const FlowContext = React.createContext<FlowContextState | null>(null);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flows, setFlows] = React.useState<FlowDefinition[]>([]);
  const [selectedFlow, setSelectedFlow] = React.useState<FlowDefinition | null>(
    null
  );
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [currentExecution, setCurrentExecution] =
    React.useState<FlowExecutionResult | null>(null);
  const [executionError, setExecutionError] = React.useState<string | null>(
    null
  );
  const [selectedPermutationId, setSelectedPermutationId] = React.useState<
    string | null
  >(null);
  const [selectedRecording, setSelectedRecording] =
    React.useState<FlowRecording | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load flows from API
  const loadFlows = React.useCallback(async () => {
    try {
      const response = await fetch("/api/flow");
      const data = await response.json();
      setFlows(data.flows || []);

      // Select first flow by default
      if (data.flows?.length > 0 && !selectedFlow) {
        setSelectedFlow(data.flows[0]);
      }
    } catch (error) {
      console.error("Failed to load flows:", error);
    }
  }, [selectedFlow]);

  // Select a flow
  const selectFlow = React.useCallback(
    (flowId: string) => {
      const flow = flows.find((f) => f.id === flowId);
      if (flow) {
        setSelectedFlow(flow);
      }
    },
    [flows]
  );

  // Execute flow
  const executeFlow = React.useCallback(
    async (options?: { permutations?: "all" | string[]; maxParallel?: number }) => {
      if (!selectedFlow) {
        setExecutionError("No flow selected");
        return;
      }

      setIsExecuting(true);
      setExecutionError(null);
      setCurrentExecution(null);
      setSelectedPermutationId(null);
      setSelectedRecording(null);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/flow/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: selectedFlow.id,
            permutations: options?.permutations || "all",
            maxParallel: options?.maxParallel || 6,
            resolution: [1024, 720],
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to start execution");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: FlowSSEEvent = JSON.parse(line.slice(6));
                handleFlowEvent(event);
              } catch (e) {
                console.error("Failed to parse event:", e);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setExecutionError(error.message);
        }
      } finally {
        setIsExecuting(false);
        abortControllerRef.current = null;
      }
    },
    [selectedFlow]
  );

  // Handle SSE events
  const handleFlowEvent = React.useCallback((event: FlowSSEEvent) => {
    switch (event.type) {
      case FlowSSEEventType.FLOW_STARTED:
        setCurrentExecution({
          executionId: event.executionId,
          flowId: event.flowId,
          flowName: selectedFlow?.name || "",
          status: "running",
          permutations: [],
          summary: {
            total: event.totalPermutations,
            passed: 0,
            failed: 0,
            running: 0,
            pending: event.totalPermutations,
          },
          startedAt: new Date(),
        });
        break;

      case FlowSSEEventType.PERMUTATION_STARTED:
        setCurrentExecution((prev) => {
          if (!prev) return prev;
          const newPerm: PermutationResult = {
            permutationId: event.permutationId,
            order: event.order,
            label: event.label,
            status: "running",
            passed: false,
            recording: {
              permutationId: event.permutationId,
              frames: [],
              totalDuration: 0,
              stepBoundaries: [],
            },
            verificationResults: [],
            vncUrl: event.vncUrl,
            sandboxId: event.sandboxId,
            startedAt: new Date(),
          };
          return {
            ...prev,
            permutations: [...prev.permutations, newPerm],
            summary: {
              ...prev.summary,
              running: prev.summary.running + 1,
              pending: prev.summary.pending - 1,
            },
          };
        });
        break;

      case FlowSSEEventType.STEP_STARTED:
        // Update permutation status
        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            permutations: prev.permutations.map((p) =>
              p.permutationId === event.permutationId
                ? { ...p, status: "running" }
                : p
            ),
          };
        });
        break;

      case FlowSSEEventType.STEP_COMPLETED:
        // Add verification result
        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            permutations: prev.permutations.map((p) =>
              p.permutationId === event.permutationId
                ? {
                    ...p,
                    verificationResults: [
                      ...p.verificationResults,
                      event.verification,
                    ],
                  }
                : p
            ),
          };
        });
        break;

      case FlowSSEEventType.PERMUTATION_COMPLETED:
        setCurrentExecution((prev) => {
          if (!prev) return prev;
          const newPermutations = prev.permutations.map((p) =>
            p.permutationId === event.permutationId
              ? {
                  ...p,
                  status: "completed" as const,
                  passed: event.passed,
                  verificationResults: event.verificationResults,
                  completedAt: new Date(),
                }
              : p
          );

          const passed = newPermutations.filter(
            (p) => p.status === "completed" && p.passed
          ).length;
          const failed = newPermutations.filter(
            (p) =>
              p.status === "failed" ||
              (p.status === "completed" && !p.passed)
          ).length;
          const running = newPermutations.filter(
            (p) => p.status === "running"
          ).length;

          return {
            ...prev,
            permutations: newPermutations,
            summary: {
              ...prev.summary,
              passed,
              failed,
              running,
            },
          };
        });
        break;

      case FlowSSEEventType.FLOW_COMPLETED:
        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: "completed",
            summary: event.summary,
            completedAt: new Date(),
          };
        });
        break;

      case FlowSSEEventType.ERROR:
        if (event.permutationId) {
          setCurrentExecution((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              permutations: prev.permutations.map((p) =>
                p.permutationId === event.permutationId
                  ? { ...p, status: "failed" as const, error: event.error }
                  : p
              ),
            };
          });
        } else {
          setExecutionError(event.error);
        }
        break;
    }
  }, [selectedFlow]);

  // Cancel execution
  const cancelExecution = React.useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Select permutation for playback
  const selectPermutation = React.useCallback((permutationId: string) => {
    setSelectedPermutationId(permutationId);
  }, []);

  // Load recording for playback
  const loadRecording = React.useCallback(
    async (executionId: string, permutationId: string) => {
      try {
        const response = await fetch(
          `/api/flow/execution/${executionId}/playback?permutationId=${permutationId}`
        );
        const data = await response.json();

        if (data.recording) {
          setSelectedRecording(data.recording);
        }
      } catch (error) {
        console.error("Failed to load recording:", error);
      }
    },
    []
  );

  const value: FlowContextState = {
    flows,
    selectedFlow,
    isExecuting,
    currentExecution,
    executionError,
    selectedPermutationId,
    selectedRecording,
    loadFlows,
    selectFlow,
    executeFlow,
    cancelExecution,
    selectPermutation,
    loadRecording,
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = React.useContext(FlowContext);
  if (!context) {
    throw new Error("useFlow must be used within a FlowProvider");
  }
  return context;
}
