"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  FlowExecutionResult,
  PermutationResult,
  VerificationResult,
} from "@/types/flow";
import { CheckCircle, XCircle, Eye } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ResultsSummaryProps {
  execution: FlowExecutionResult;
  onViewPlayback?: (permutationId: string) => void;
}

export function ResultsSummary({ execution, onViewPlayback }: ResultsSummaryProps) {
  const passRate =
    execution.summary.total > 0
      ? Math.round((execution.summary.passed / execution.summary.total) * 100)
      : 0;

  return (
    <Card variant="layer" className="w-full">
      <CardHeader>
        <CardTitle>Results: {execution.flowName}</CardTitle>
        <CardDescription>
          Execution {execution.executionId.substring(0, 8)}...
          {execution.completedAt && (
            <> completed at {new Date(execution.completedAt).toLocaleString()}</>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary stats */}
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-mono font-bold">{passRate}%</div>
            <div className="text-xs text-fg-300 uppercase">Pass Rate</div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-success/10 rounded-sm">
              <div className="text-xl font-mono text-success">
                {execution.summary.passed}
              </div>
              <div className="text-xs text-success uppercase">Passed</div>
            </div>
            <div className="text-center p-3 bg-error/10 rounded-sm">
              <div className="text-xl font-mono text-error">
                {execution.summary.failed}
              </div>
              <div className="text-xs text-error uppercase">Failed</div>
            </div>
            <div className="text-center p-3 bg-bg-200 rounded-sm">
              <div className="text-xl font-mono text-fg-300">
                {execution.summary.total}
              </div>
              <div className="text-xs text-fg-300 uppercase">Total</div>
            </div>
          </div>
        </div>

        {/* Permutation results table */}
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-200">
              <tr>
                <th className="px-4 py-2 text-left font-mono text-xs uppercase text-fg-300">
                  Order
                </th>
                <th className="px-4 py-2 text-center font-mono text-xs uppercase text-fg-300">
                  Result
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs uppercase text-fg-300">
                  Details
                </th>
                <th className="px-4 py-2 text-right font-mono text-xs uppercase text-fg-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {execution.permutations.map((perm) => (
                <PermutationRow
                  key={perm.permutationId}
                  permutation={perm}
                  onViewPlayback={onViewPlayback}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface PermutationRowProps {
  permutation: PermutationResult;
  onViewPlayback?: (permutationId: string) => void;
}

function PermutationRow({ permutation, onViewPlayback }: PermutationRowProps) {
  const [expanded, setExpanded] = React.useState(false);

  const getDetailsSummary = (): string => {
    if (permutation.status !== "completed") {
      return permutation.error || permutation.status;
    }

    const failed = permutation.verificationResults.filter((v) => !v.passed);
    if (failed.length === 0) {
      return "All steps verified";
    }

    return `${failed.length} step(s) failed verification`;
  };

  return (
    <>
      <tr
        className={cn(
          "border-t border-border cursor-pointer hover:bg-bg-200/50",
          expanded && "bg-bg-200/30"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 font-mono">{permutation.label}</td>
        <td className="px-4 py-3 text-center">
          {permutation.status === "completed" ? (
            permutation.passed ? (
              <CheckCircle
                size={20}
                weight="fill"
                className="inline text-success"
              />
            ) : (
              <XCircle size={20} weight="fill" className="inline text-error" />
            )
          ) : (
            <span className="text-fg-300 text-xs uppercase">
              {permutation.status}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-fg-300">{getDetailsSummary()}</td>
        <td className="px-4 py-3 text-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewPlayback?.(permutation.permutationId);
            }}
          >
            <Eye size={16} className="mr-1" />
            Playback
          </Button>
        </td>
      </tr>

      {/* Expanded verification details */}
      {expanded && permutation.verificationResults.length > 0 && (
        <tr className="bg-bg-200/20">
          <td colSpan={4} className="px-4 py-3">
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase text-fg-300 mb-2">
                Verification Details
              </div>
              {permutation.verificationResults.map((v, i) => (
                <VerificationDetail key={i} verification={v} index={i} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface VerificationDetailProps {
  verification: VerificationResult;
  index: number;
}

function VerificationDetail({ verification, index }: VerificationDetailProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-sm border",
        verification.passed
          ? "border-success/30 bg-success/5"
          : "border-error/30 bg-error/5"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm">Step {index + 1}</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-mono",
              verification.passed ? "text-success" : "text-error"
            )}
          >
            {verification.passed ? "PASSED" : "FAILED"}
          </span>
          <span className="text-xs text-fg-300">
            ({Math.round(verification.confidence * 100)}% confidence)
          </span>
        </div>
      </div>
      <p className="text-sm text-fg-300">{verification.reasoning}</p>
    </div>
  );
}
