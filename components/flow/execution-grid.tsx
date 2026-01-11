"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PermutationResult, FlowExecutionSummary } from "@/types/flow";
import { ExecutionCard } from "./execution-card";

interface ExecutionGridProps {
  permutations: PermutationResult[];
  summary?: FlowExecutionSummary;
  selectedPermutationId?: string;
  onSelectPermutation?: (permutationId: string) => void;
}

export function ExecutionGrid({
  permutations,
  summary,
  selectedPermutationId,
  onSelectPermutation,
}: ExecutionGridProps) {
  return (
    <div className="space-y-4">
      {/* Summary header */}
      {summary && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-fg-300">
              {summary.total} permutations
            </span>
            {summary.running > 0 && (
              <span className="font-mono text-sm text-accent">
                {summary.running} running
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {summary.passed > 0 && (
              <span className="font-mono text-sm text-success">
                {summary.passed} passed
              </span>
            )}
            {summary.failed > 0 && (
              <span className="font-mono text-sm text-error">
                {summary.failed} failed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div
        className={cn(
          "grid gap-4",
          permutations.length <= 2 && "grid-cols-2",
          permutations.length >= 3 && permutations.length <= 4 && "grid-cols-2",
          permutations.length >= 5 && permutations.length <= 6 && "grid-cols-3",
          permutations.length > 6 && "grid-cols-3 md:grid-cols-4"
        )}
      >
        {permutations.map((perm) => (
          <ExecutionCard
            key={perm.permutationId}
            permutation={perm}
            isActive={perm.permutationId === selectedPermutationId}
            onClick={() => onSelectPermutation?.(perm.permutationId)}
          />
        ))}
      </div>
    </div>
  );
}
