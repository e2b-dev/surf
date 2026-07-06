"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Camera,
  GitFork,
  LogIn,
  MoonIcon,
  Power,
  SunIcon,
} from "lucide-react";
import Frame from "@/components/frame";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentPane } from "@/components/fork/agent-pane";
import { ForkRunner } from "@/components/fork/fork-runner";
import { useAgentRun, AgentStatus } from "@/lib/fork/use-agent-run";
import {
  FORK_COUNT,
  FORK_RESOLUTION,
  DEMO_SITE,
  ForkDemoConfig,
} from "@/lib/fork/config";
import {
  ForkInfo,
  getForkDemoConfig,
  snapshotAndForkAction,
  stopSandboxesAction,
} from "@/app/actions";
import { cn } from "@/lib/utils";

type Stage =
  | "intro"
  | "authenticating"
  | "authenticated"
  | "forking"
  | "exploring";

const STEPS: { key: Stage[]; label: string; icon: typeof LogIn }[] = [
  { key: ["authenticating", "authenticated"], label: "1 · Authenticate", icon: LogIn },
  { key: ["forking"], label: "2 · Snapshot", icon: Camera },
  { key: ["exploring"], label: "3 · Fork & explore", icon: GitFork },
];

export default function ForkDemoPage() {
  const { theme, setTheme } = useTheme();
  const primary = useAgentRun();

  const [stage, setStage] = useState<Stage>("intro");
  const [forks, setForks] = useState<ForkInfo[]>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [forkStatuses, setForkStatuses] = useState<Record<string, AgentStatus>>(
    {}
  );
  const [demoConfig, setDemoConfig] = useState<ForkDemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Load the demo tasks (built server-side from .env.local credentials).
  useEffect(() => {
    getForkDemoConfig()
      .then(setDemoConfig)
      .catch((e) => {
        console.error(e);
        setConfigError(
          "Demo credentials missing. Set DEMO_SITE_USERNAME and DEMO_SITE_PASSWORD in .env.local."
        );
      });
  }, []);

  const handleForkStatus = useCallback(
    (sandboxId: string, status: AgentStatus) => {
      setForkStatuses((prev) =>
        prev[sandboxId] === status ? prev : { ...prev, [sandboxId]: status }
      );
    },
    []
  );

  const allForksDone = useMemo(
    () =>
      forks.length > 0 &&
      forks.every((f) => {
        const s = forkStatuses[f.sandboxId];
        return s === "done" || s === "error";
      }),
    [forks, forkStatuses]
  );

  const startDemo = async () => {
    if (!demoConfig) return;
    setStage("authenticating");
    const sandboxId = await primary.run({
      task: demoConfig.authTask,
      resolution: FORK_RESOLUTION,
    });
    if (sandboxId) {
      setStage("authenticated");
      toast.success("Agent authenticated — ready to snapshot & fork");
    } else {
      setStage("intro");
      toast.error("Could not start the authenticated agent");
    }
  };

  const forkAgent = async () => {
    if (!primary.sandboxId) return;
    setStage("forking");
    toast("Snapshotting sandbox & spawning forks…");
    try {
      const result = await snapshotAndForkAction(primary.sandboxId, FORK_COUNT);
      setSnapshotId(result.snapshotId);
      setForks(result.forks);
      setStage("exploring");
      toast.success(`${result.forks.length} forks resumed — already logged in`);
    } catch (e) {
      console.error(e);
      setStage("authenticated");
      toast.error("Failed to snapshot & fork the sandbox");
    }
  };

  const reset = async () => {
    primary.stop();
    const ids = [
      primary.sandboxId,
      ...forks.map((f) => f.sandboxId),
    ].filter(Boolean) as string[];
    if (ids.length > 0) {
      // Fire and forget — don't block the UI reset on teardown.
      void stopSandboxesAction(ids);
    }
    primary.reset();
    setForks([]);
    setForkStatuses({});
    setSnapshotId(null);
    setStage("intro");
    toast("Demo reset — sandboxes are being stopped");
  };

  const hasStarted = stage !== "intro";

  return (
    <div className="w-full flex justify-center items-center min-h-dvh overflow-auto p-2 sm:p-4 md:p-8">
      <Frame
        classNames={{
          wrapper: "w-full max-w-[2000px]",
          frame: "flex flex-col",
        }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/" className="flex items-center gap-1 shrink-0">
              <Logo className="h-4 w-auto sm:h-[18px]" />
            </Link>
            <h1 className="flex min-w-0 items-center gap-2 truncate text-base sm:text-lg">
              Forking an authenticated agent
              <Badge variant="accent" className="hidden sm:inline-flex">
                E2B Snapshots
              </Badge>
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Stepper stage={stage} />
            <Button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              variant="outline"
              size="icon"
              suppressHydrationWarning
            >
              {theme === "dark" ? (
                <SunIcon className="h-5 w-5" suppressHydrationWarning />
              ) : (
                <MoonIcon className="h-5 w-5" suppressHydrationWarning />
              )}
            </Button>
            {hasStarted && (
              <Button onClick={reset} variant="error" className="text-xs">
                <Power className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-3 sm:p-4">
          {stage === "intro" ? (
            <Intro
              onStart={startDemo}
              ready={!!demoConfig}
              configError={configError}
              username={demoConfig?.username}
            />
          ) : (
            <>
              {/* Primary authenticated agent */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-medium">
                    Primary agent — authenticating on{" "}
                    <span className="text-accent">{DEMO_SITE.host}</span>
                  </h2>
                </div>
                <AgentPane
                  className="max-w-2xl"
                  title="Primary agent"
                  subtitle={
                    demoConfig
                      ? `Signs in as ${demoConfig.username}, then we snapshot it`
                      : "Signing in, then we snapshot it"
                  }
                  status={primary.status}
                  log={primary.log}
                  vncUrl={primary.vncUrl}
                  error={primary.error}
                  authenticated={
                    stage === "authenticated" ||
                    stage === "forking" ||
                    stage === "exploring"
                  }
                  frozen={stage === "forking" || stage === "exploring"}
                  frozenLabel={
                    stage === "forking"
                      ? "Snapshotting…"
                      : "Snapshot captured — paused"
                  }
                />

                {stage === "authenticated" && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xs border border-accent/40 bg-accent/5 p-3">
                    <Camera className="h-5 w-5 text-accent" />
                    <p className="flex-1 text-sm text-fg-300">
                      Logged in. Snapshot its full state and fork into{" "}
                      <strong className="text-fg">{FORK_COUNT}</strong>{" "}
                      independent agents.
                    </p>
                    <Button onClick={forkAgent} variant="accent">
                      <GitFork className="h-4 w-4" /> Snapshot & fork ×{FORK_COUNT}
                    </Button>
                  </div>
                )}
              </section>

              {/* Forks */}
              {forks.length > 0 && (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GitFork className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-medium">
                      {FORK_COUNT} forks exploring in parallel
                    </h2>
                    <Badge variant="muted" className="gap-1">
                      snapshot {snapshotId?.slice(0, 18)}…
                    </Badge>
                    {allForksDone && (
                      <Badge variant="success">All forks finished</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {forks.map((fork, i) => (
                      <ForkRunner
                        key={fork.sandboxId}
                        index={i}
                        sandboxId={fork.sandboxId}
                        vncUrl={fork.vncUrl}
                        task={
                          demoConfig!.forkTasks[i % demoConfig!.forkTasks.length]
                        }
                        onStatusChange={handleForkStatus}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </Frame>
    </div>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  return (
    <div className="hidden items-center gap-1 md:flex">
      {STEPS.map((step, i) => {
        const active = step.key.includes(stage);
        const done =
          STEPS.findIndex((s) => s.key.includes(stage)) > i || stage === "exploring" && i < 2;
        const Icon = step.icon;
        return (
          <div
            key={step.label}
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-mono",
              active
                ? "border-accent/50 bg-accent/10 text-accent"
                : done
                ? "border-success/40 bg-success/10 text-success"
                : "border-border text-fg-500"
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden lg:inline">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Intro({
  onStart,
  ready,
  configError,
  username,
}: {
  onStart: () => void;
  ready: boolean;
  configError: string | null;
  username?: string;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-10 text-center">
      <div className="flex items-center gap-2 text-accent">
        <GitFork className="h-5 w-5" />
        <span className="font-mono text-sm uppercase tracking-wider">
          E2B Snapshot Fork Demo
        </span>
      </div>
      <h2 className="text-2xl font-light">
        One agent logs in on{" "}
        <span className="text-fg">{DEMO_SITE.label}</span>
        {username && (
          <>
            {" "}
            as <span className="text-fg">{username}</span>
          </>
        )}
        , then{" "}
        <span className="text-accent">forks itself {FORK_COUNT}×</span> to explore
        in parallel — every fork already authenticated.
      </h2>
      <div className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <IntroCard
          icon={LogIn}
          title="Authenticate once"
          body="Do the slow, sensitive auth flow a single time."
        />
        <IntroCard
          icon={Camera}
          title="Snapshot state"
          body="Capture memory + disk, including the session cookies."
        />
        <IntroCard
          icon={GitFork}
          title="Fork & parallelize"
          body={`Spin up ${FORK_COUNT} agents that share the state securely.`}
        />
      </div>
      <Button
        onClick={onStart}
        variant="accent"
        size="lg"
        className="mt-2"
        disabled={!ready}
      >
        <LogIn className="h-4 w-4" /> Start the demo
      </Button>
      {configError ? (
        <p className="text-xs text-error">{configError}</p>
      ) : (
        <p className="text-xs text-fg-500">
          Uses this project&apos;s existing E2B + OpenAI setup. Resolution{" "}
          {FORK_RESOLUTION[0]}×{FORK_RESOLUTION[1]}.
        </p>
      )}
    </div>
  );
}

function IntroCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof LogIn;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xs border bg-bg-200 p-3">
      <Icon className="h-4 w-4 text-accent" />
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-fg-500">{body}</p>
    </div>
  );
}
