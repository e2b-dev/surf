"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FlowProvider, useFlow } from "@/lib/flow-context";
import { ExecutionGrid } from "@/components/flow/execution-grid";
import { VMViewer } from "@/components/flow/vm-viewer";
import { PlaybackViewer } from "@/components/flow/playback-viewer";
import { ResultsSummary } from "@/components/flow/results-summary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Play,
  Stop,
  ArrowLeft,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";

function FlowPageContent() {
  const {
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
  } = useFlow();

  const [view, setView] = React.useState<"setup" | "execution" | "results" | "playback">(
    "setup"
  );

  // Load flows on mount
  React.useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  // Switch to execution view when execution starts
  React.useEffect(() => {
    if (isExecuting) {
      setView("execution");
    }
  }, [isExecuting]);

  // Switch to results view when execution completes
  React.useEffect(() => {
    if (currentExecution?.status === "completed" && !isExecuting) {
      setView("results");
    }
  }, [currentExecution?.status, isExecuting]);

  // Handle view playback
  const handleViewPlayback = React.useCallback(
    async (permutationId: string) => {
      if (currentExecution) {
        selectPermutation(permutationId);
        await loadRecording(currentExecution.executionId, permutationId);
        setView("playback");
      }
    },
    [currentExecution, selectPermutation, loadRecording]
  );

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-fg-300 hover:text-fg">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-mono text-lg font-medium tracking-wider">
              Flow Simulation
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {view !== "setup" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("setup")}
              >
                New Run
              </Button>
            )}
            {currentExecution?.status === "completed" && view !== "results" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("results")}
              >
                Results
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {executionError && (
          <div className="mb-4 p-4 bg-error/10 border border-error/30 rounded-sm text-error">
            {executionError}
          </div>
        )}

        {/* Setup View */}
        {view === "setup" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card variant="layer">
              <CardHeader>
                <CardTitle>Flow Configuration</CardTitle>
                <CardDescription>
                  Select a flow and configure execution options
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Flow selection */}
                <div className="space-y-2">
                  <label className="text-sm font-mono text-fg-300 uppercase">
                    Flow
                  </label>
                  <select
                    value={selectedFlow?.id || ""}
                    onChange={(e) => selectFlow(e.target.value)}
                    className="w-full p-2 bg-bg-200 border border-border rounded-sm font-mono text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Flow steps preview */}
                {selectedFlow && (
                  <div className="space-y-2">
                    <label className="text-sm font-mono text-fg-300 uppercase">
                      Steps
                    </label>
                    <div className="flex gap-2">
                      {selectedFlow.steps.map((step, i) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-2 px-3 py-2 bg-bg-200 rounded-sm"
                        >
                          <span className="text-xs font-mono text-fg-300">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-sm">{step.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Permutation info */}
                {selectedFlow && (
                  <div className="p-4 bg-bg-200 rounded-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-fg-300">
                        Total permutations
                      </span>
                      <span className="font-mono">
                        {factorial(selectedFlow.steps.length)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-fg-300">
                      All {factorial(selectedFlow.steps.length)} orderings of{" "}
                      {selectedFlow.steps.length} steps will be executed in
                      parallel
                    </p>
                  </div>
                )}

                {/* Execute button */}
                <Button
                  className="w-full"
                  onClick={() => executeFlow()}
                  disabled={!selectedFlow || isExecuting}
                  loading={isExecuting}
                >
                  <Play size={16} className="mr-2" />
                  Execute All Permutations
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Execution View */}
        {view === "execution" && currentExecution && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-mono font-medium">
                  Executing: {currentExecution.flowName}
                </h2>
                <p className="text-sm text-fg-300">
                  {currentExecution.summary.running} running,{" "}
                  {currentExecution.summary.passed} passed,{" "}
                  {currentExecution.summary.failed} failed
                </p>
              </div>

              {isExecuting && (
                <Button variant="error" onClick={cancelExecution}>
                  <Stop size={16} className="mr-2" />
                  Cancel
                </Button>
              )}
            </div>

            <VMViewer
              permutations={currentExecution.permutations}
              onSelectPermutation={handleViewPlayback}
            />
          </div>
        )}

        {/* Results View */}
        {view === "results" && currentExecution && (
          <div className="space-y-6">
            <ResultsSummary
              execution={currentExecution}
              onViewPlayback={handleViewPlayback}
            />

            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setView("setup");
                }}
              >
                <ArrowsClockwise size={16} className="mr-2" />
                Run Again
              </Button>
            </div>
          </div>
        )}

        {/* Playback View */}
        {view === "playback" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setView("results")}>
                <ArrowLeft size={16} className="mr-2" />
                Back to Results
              </Button>

              {selectedPermutationId && currentExecution && (
                <span className="font-mono text-sm text-fg-300">
                  Permutation:{" "}
                  {
                    currentExecution.permutations.find(
                      (p) => p.permutationId === selectedPermutationId
                    )?.label
                  }
                </span>
              )}
            </div>

            {selectedRecording ? (
              <PlaybackViewer recording={selectedRecording} />
            ) : (
              <div className="flex items-center justify-center h-64 text-fg-300">
                Loading recording...
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Helper function for factorial
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

export default function FlowPage() {
  return (
    <FlowProvider>
      <FlowPageContent />
    </FlowProvider>
  );
}
