"use client";

import { useEffect } from "react";
import { AgentPane } from "@/components/fork/agent-pane";
import { AgentStatus, useAgentRun } from "@/lib/fork/use-agent-run";
import { FORK_RESOLUTION, ForkTask } from "@/lib/fork/config";

interface ForkRunnerProps {
  index: number;
  sandboxId: string;
  vncUrl: string;
  task: ForkTask;
  onStatusChange: (sandboxId: string, status: AgentStatus) => void;
}

/**
 * Owns one forked agent: renders its live pane and, on mount, kicks off its
 * exploration task against the already-authenticated forked sandbox.
 */
export function ForkRunner({
  index,
  sandboxId,
  vncUrl,
  task,
  onStatusChange,
}: ForkRunnerProps) {
  const agent = useAgentRun();

  // Start the exploration task once, as soon as this fork mounts.
  useEffect(() => {
    agent.run({ task: task.prompt, sandboxId, resolution: FORK_RESOLUTION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onStatusChange(sandboxId, agent.status);
  }, [agent.status, sandboxId, onStatusChange]);

  return (
    <AgentPane
      title={`Fork ${index + 1} · ${task.title}`}
      subtitle={task.summary}
      status={agent.status}
      log={agent.log}
      vncUrl={vncUrl ?? agent.vncUrl}
      error={agent.error}
      authenticated
    />
  );
}
