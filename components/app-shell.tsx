"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  MoonIcon,
  SunIcon,
  Timer,
  Power,
  Download,
  Menu,
  X,
  LogOut,
  Play,
  Pause,
  History,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ensureSandboxAction,
  deleteAllSandboxesAction,
  deleteSandboxAction,
  increaseTimeout,
  listSandboxesAction,
  logoutAction,
  pauseSandboxAction,
  resumeLatestSandboxAction,
  resumeSandboxAction,
  resizeSandboxDisplayAction,
  stopSandboxAction,
  type SandboxSummary,
} from "@/app/actions";
import { motion, AnimatePresence } from "framer-motion";
import { ChatList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/input";
import { useChat } from "@/lib/chat-context";
import Frame from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader, AssemblyLoader } from "@/components/loader";
import Link from "next/link";
import Logo from "@/components/logo";
import {
  SANDBOX_PROVIDER_MAX_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
  SANDBOX_TIMEOUT_OPTIONS,
} from "@/lib/config";
import { normalizeSandboxStreamResolution } from "@/lib/sandbox-stream";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYCHEX_FLOW_TITLE } from "@/lib/paychex-flow";

interface AppShellProps {
  userEmail: string;
}

const SANDBOX_LEASE_RENEWAL_INTERVAL_MS = 45 * 60 * 1000;

type SandboxSession = {
  sandboxId: string;
  vncUrl: string;
  timeoutMs: number;
  expiresAt: string;
  timeRemainingSeconds: number;
};

export default function AppShell({ userEmail }: AppShellProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [timeRemaining, setTimeRemaining] = useState<number>(
    SANDBOX_TIMEOUT_MS / 1000
  );
  const [expiresAtMs, setExpiresAtMs] = useState<number>(
    Date.now() + SANDBOX_TIMEOUT_MS
  );
  const [selectedTimeoutMs, setSelectedTimeoutMs] = useState<number>(
    SANDBOX_TIMEOUT_MS
  );
  const [isTabVisible, setIsTabVisible] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iFrameWrapperRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sandboxes, setSandboxes] = useState<SandboxSummary[]>([]);
  const [hasLoadedSandboxes, setHasLoadedSandboxes] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sandboxActionId, setSandboxActionId] = useState<string | null>(null);
  const [isDeletingAllSandboxes, setIsDeletingAllSandboxes] = useState(false);
  const hasAutoStartedRef = useRef(false);
  const lastLeaseRenewedAtRef = useRef<number | null>(null);
  const leaseRenewalInFlightRef = useRef(false);
  const lastDisplayResizeRef = useRef<string | null>(null);
  const displayResizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const {
    messages,
    isLoading: chatLoading,
    input,
    setInput,
    sendMessage,
    stopGeneration,
    clearMessages,
    handleSubmit,
    onSandboxCreated,
  } = useChat();

  const resumableSandboxes = useMemo(
    () =>
      sandboxes.filter(
        (sandbox) =>
          sandbox.state === "running" || sandbox.state === "paused"
      ),
    [sandboxes]
  );
  const latestResumableSandbox = resumableSandboxes[0];

  const refreshSandboxes = useCallback(async () => {
    try {
      const result = await listSandboxesAction();
      if (result.ok) {
        setSandboxes(result.sandboxes);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Failed to refresh sandboxes:", error);
      toast.error("Failed to load sandboxes");
    } finally {
      setHasLoadedSandboxes(true);
    }
  }, []);

  const resetSandboxSession = useCallback(
    (options: { clearChat?: boolean } = {}) => {
      const { clearChat = false } = options;

      setSandboxId(null);
      setVncUrl(null);
      setSelectedTimeoutMs(SANDBOX_TIMEOUT_MS);
      setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
      setExpiresAtMs(Date.now() + SANDBOX_TIMEOUT_MS);
      lastLeaseRenewedAtRef.current = null;
      lastDisplayResizeRef.current = null;
      stopGeneration();
      if (clearChat) {
        clearMessages();
      }
    },
    [clearMessages, stopGeneration]
  );

  const applySandboxSession = useCallback((session: SandboxSession) => {
    setSandboxId(session.sandboxId);
    setVncUrl(session.vncUrl);
    setSelectedTimeoutMs(session.timeoutMs);
    setTimeRemaining(session.timeRemainingSeconds);
    setExpiresAtMs(Date.parse(session.expiresAt));
    lastLeaseRenewedAtRef.current = Date.now();
    lastDisplayResizeRef.current = null;
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };

    setIsTabVisible(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const stopSandbox = async () => {
    if (sandboxId) {
      try {
        const success = await stopSandboxAction(sandboxId);
        if (success) {
          resetSandboxSession({ clearChat: true });
          await refreshSandboxes();
          toast("Sandbox instance stopped");
        } else {
          toast.error("Failed to stop sandbox instance");
        }
      } catch (error) {
        console.error("Failed to stop sandbox:", error);
        toast.error("Failed to stop sandbox");
      }
    }
  };

  const getSandboxResolution = useCallback((): [number, number] => {
    const width = iFrameWrapperRef.current?.clientWidth ?? window.innerWidth;
    const height =
      iFrameWrapperRef.current?.clientHeight ?? window.innerHeight;

    return normalizeSandboxStreamResolution([width, height]);
  }, []);

  const resizeSandboxDisplay = useCallback(
    async (resolution = getSandboxResolution()) => {
      if (!sandboxId) return;

      const normalizedResolution = normalizeSandboxStreamResolution(resolution);
      const resizeKey = normalizedResolution.join("x");
      if (lastDisplayResizeRef.current === resizeKey) return;

      lastDisplayResizeRef.current = resizeKey;

      const result = await resizeSandboxDisplayAction(
        sandboxId,
        normalizedResolution
      );

      if (!result.ok) {
        console.error(result.error);
      }
    },
    [getSandboxResolution, sandboxId]
  );

  const handleIncreaseTimeout = useCallback(
    async (
      timeoutMs = selectedTimeoutMs,
      options: { resetDisplay?: boolean; showToast?: boolean } = {}
    ) => {
      if (!sandboxId) return false;

      const { resetDisplay = true, showToast = true } = options;

      try {
        const result = await increaseTimeout(sandboxId, timeoutMs);
        if (result.ok) {
          lastLeaseRenewedAtRef.current = Date.now();
          setExpiresAtMs(Date.parse(result.expiresAt));
          if (resetDisplay) {
            setTimeRemaining(result.timeRemainingSeconds);
          }
          if (showToast) {
            toast.success("Instance time updated");
          }
          return true;
        } else {
          if (showToast) {
            toast.error("Failed to update instance time");
          }
          return false;
        }
      } catch (error) {
        console.error("Failed to increase time:", error);
        if (showToast) {
          toast.error("Failed to increase time");
        }
        return false;
      }
    },
    [sandboxId, selectedTimeoutMs]
  );

  const handleTimeoutChange = (value: string) => {
    const timeoutMs = Number.parseInt(value, 10);

    setSelectedTimeoutMs(timeoutMs);
    if (sandboxId) {
      handleIncreaseTimeout(timeoutMs);
    }
  };

  const handleExportDownloads = () => {
    if (!sandboxId) return;

    window.open(`/api/sandbox/${sandboxId}/downloads`, "_blank");
  };

  const onSubmit = (e: React.FormEvent) => {
    const content = handleSubmit(e);
    if (content) {
      sendMessage({
        content,
        sandboxId: sandboxId || undefined,
        environment: "linux",
        resolution: getSandboxResolution(),
      });
    }
  };

  const handleSandboxCreated = useCallback((newSandboxId: string, newVncUrl: string) => {
    setSandboxId(newSandboxId);
    setVncUrl(newVncUrl);
    setSelectedTimeoutMs(SANDBOX_TIMEOUT_MS);
    setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
    setExpiresAtMs(Date.now() + SANDBOX_TIMEOUT_MS);
    lastLeaseRenewedAtRef.current = Date.now();
    lastDisplayResizeRef.current = null;
    refreshSandboxes();
    toast.success("Sandbox instance created");
  }, [refreshSandboxes]);

  const startOrResumeSandbox = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await ensureSandboxAction({
        resolution: getSandboxResolution(),
      });

      if (result.ok) {
        applySandboxSession(result);
        await refreshSandboxes();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Failed to start or resume sandbox:", error);
      toast.error("Failed to start sandbox");
    } finally {
      setIsLoading(false);
    }
  }, [applySandboxSession, getSandboxResolution, refreshSandboxes]);

  const resumeSandbox = useCallback(
    async (targetSandboxId: string) => {
      setSandboxActionId(targetSandboxId);
      setIsLoading(true);

      try {
        const result = await resumeSandboxAction(targetSandboxId);

        if (result.ok) {
          applySandboxSession(result);
          await refreshSandboxes();
          setIsHistoryOpen(false);
          toast.success("Sandbox resumed");
        } else {
          toast.error(result.error);
          await refreshSandboxes();
        }
      } catch (error) {
        console.error("Failed to resume sandbox:", error);
        toast.error("Failed to resume sandbox");
        await refreshSandboxes();
      } finally {
        setSandboxActionId(null);
        setIsLoading(false);
      }
    },
    [applySandboxSession, refreshSandboxes]
  );

  const resumeLatestSandbox = useCallback(async () => {
    if (!latestResumableSandbox) {
      toast.error("No saved sandbox found");
      return;
    }

    setSandboxActionId(latestResumableSandbox.sandboxId);
    setIsLoading(true);

    try {
      const result = await resumeLatestSandboxAction();

      if (result.ok) {
        applySandboxSession(result);
        await refreshSandboxes();
        toast.success("Sandbox resumed");
      } else {
        toast.error(result.error);
        await refreshSandboxes();
      }
    } catch (error) {
      console.error("Failed to resume latest sandbox:", error);
      toast.error("Failed to resume sandbox");
      await refreshSandboxes();
    } finally {
      setSandboxActionId(null);
      setIsLoading(false);
    }
  }, [applySandboxSession, latestResumableSandbox, refreshSandboxes]);

  const pauseSandbox = useCallback(
    async (targetSandboxId: string) => {
      setSandboxActionId(targetSandboxId);

      try {
        const result = await pauseSandboxAction(targetSandboxId);

        if (result.ok) {
          setSandboxes(result.sandboxes);
          if (targetSandboxId === sandboxId) {
            resetSandboxSession();
          }
          toast.success("Sandbox paused");
        } else {
          if (result.sandboxes) setSandboxes(result.sandboxes);
          toast.error(result.error);
        }
      } catch (error) {
        console.error("Failed to pause sandbox:", error);
        toast.error("Failed to pause sandbox");
        await refreshSandboxes();
      } finally {
        setSandboxActionId(null);
      }
    },
    [refreshSandboxes, resetSandboxSession, sandboxId]
  );

  const deleteSandbox = useCallback(
    async (targetSandboxId: string) => {
      if (!window.confirm("Delete this sandbox? This cannot be undone.")) {
        return;
      }

      setSandboxActionId(targetSandboxId);

      try {
        const result = await deleteSandboxAction(targetSandboxId);

        if (result.ok) {
          setSandboxes(result.sandboxes);
          if (targetSandboxId === sandboxId) {
            resetSandboxSession({ clearChat: true });
          }
          toast.success("Sandbox deleted");
        } else {
          if (result.sandboxes) setSandboxes(result.sandboxes);
          toast.error(result.error);
        }
      } catch (error) {
        console.error("Failed to delete sandbox:", error);
        toast.error("Failed to delete sandbox");
        await refreshSandboxes();
      } finally {
        setSandboxActionId(null);
      }
    },
    [refreshSandboxes, resetSandboxSession, sandboxId]
  );

  const deleteAllSandboxes = useCallback(async () => {
    if (!window.confirm("Delete all saved sandboxes? This cannot be undone.")) {
      return;
    }

    setIsDeletingAllSandboxes(true);

    try {
      const result = await deleteAllSandboxesAction();

      if (result.ok) {
        setSandboxes(result.sandboxes);
        resetSandboxSession({ clearChat: true });
        toast.success("All sandboxes deleted");
      } else {
        if (result.sandboxes) setSandboxes(result.sandboxes);
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Failed to delete all sandboxes:", error);
      toast.error("Failed to delete sandboxes");
      await refreshSandboxes();
    } finally {
      setIsDeletingAllSandboxes(false);
    }
  }, [refreshSandboxes, resetSandboxSession]);

  const handleClearChat = () => {
    clearMessages();
    toast.success("Chat cleared");
  };

  const ThemeToggle = () => (
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
  );

  const AccountControls = () => (
    <div className="flex items-center gap-2">
      <span
        className="max-w-32 truncate text-xs font-mono text-fg-400"
        title={userEmail}
      >
        {userEmail}
      </span>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="icon" title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );

  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${remainingSeconds
      .toString()
      .padStart(2, "0")}s`;
  };

  useEffect(() => {
    if (!sandboxId) return;
    const updateTimeRemaining = () => {
      setTimeRemaining(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
    };

    updateTimeRemaining();
    const interval = setInterval(() => {
      updateTimeRemaining();
    }, 1000);
    return () => clearInterval(interval);
  }, [sandboxId, expiresAtMs]);

  useEffect(() => {
    if (!sandboxId || selectedTimeoutMs <= SANDBOX_PROVIDER_MAX_TIMEOUT_MS) {
      return;
    }

    const interval = setInterval(() => {
      const lastRenewedAt = lastLeaseRenewedAtRef.current;
      if (
        !lastRenewedAt ||
        leaseRenewalInFlightRef.current ||
        Date.now() - lastRenewedAt < SANDBOX_LEASE_RENEWAL_INTERVAL_MS
      ) {
        return;
      }

      leaseRenewalInFlightRef.current = true;
      handleIncreaseTimeout(selectedTimeoutMs, {
        resetDisplay: false,
        showToast: false,
      }).finally(() => {
        leaseRenewalInFlightRef.current = false;
      });
    }, 60_000);

    return () => clearInterval(interval);
  }, [handleIncreaseTimeout, sandboxId, selectedTimeoutMs]);

  useEffect(() => {
    if (!sandboxId) return;

    if (timeRemaining === 0) {
      resetSandboxSession({ clearChat: true });
      refreshSandboxes();
      toast.error("Instance time expired");
    }
  }, [
    timeRemaining,
    sandboxId,
    resetSandboxSession,
    refreshSandboxes,
  ]);

  useEffect(() => {
    refreshSandboxes();
  }, [refreshSandboxes]);

  useEffect(() => {
    onSandboxCreated((newSandboxId: string, newVncUrl: string) => {
      handleSandboxCreated(newSandboxId, newVncUrl);
    });
  }, [handleSandboxCreated, onSandboxCreated]);

  useEffect(() => {
    if (
      hasAutoStartedRef.current ||
      chatLoading ||
      sandboxId ||
      !hasLoadedSandboxes ||
      resumableSandboxes.length > 0
    ) {
      return;
    }

    hasAutoStartedRef.current = true;
    startOrResumeSandbox();
  }, [
    chatLoading,
    hasLoadedSandboxes,
    resumableSandboxes.length,
    sandboxId,
    startOrResumeSandbox,
  ]);

  useEffect(() => {
    const wrapper = iFrameWrapperRef.current;
    if (!sandboxId || !vncUrl || !wrapper) return;

    const scheduleDisplayResize = () => {
      if (displayResizeTimeoutRef.current) {
        clearTimeout(displayResizeTimeoutRef.current);
      }

      displayResizeTimeoutRef.current = setTimeout(() => {
        void resizeSandboxDisplay(getSandboxResolution());
      }, 250);
    };

    scheduleDisplayResize();

    const observer = new ResizeObserver(scheduleDisplayResize);
    observer.observe(wrapper);
    window.addEventListener("resize", scheduleDisplayResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleDisplayResize);
      if (displayResizeTimeoutRef.current) {
        clearTimeout(displayResizeTimeoutRef.current);
        displayResizeTimeoutRef.current = null;
      }
    };
  }, [getSandboxResolution, resizeSandboxDisplay, sandboxId, vncUrl]);

  const shortSandboxId = (value: string) =>
    value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;

  const formatSandboxDate = (value: string | null) => {
    if (!value) return "Never";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const getSandboxStateVariant = (state: SandboxSummary["state"]) => {
    if (state === "running") return "success" as const;
    if (state === "paused") return "warning" as const;
    return "error" as const;
  };

  const SandboxHistoryPanel = () => (
    <AnimatePresence>
      {isHistoryOpen && (
        <motion.div
          className="border-b bg-bg"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mx-auto flex max-h-72 w-full max-w-7xl flex-col gap-3 overflow-y-auto px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-mono text-sm uppercase text-fg">
                  Saved sandboxes
                </h2>
              </div>
              <Button
                onClick={deleteAllSandboxes}
                variant="error"
                size="sm"
                loading={isDeletingAllSandboxes}
                disabled={sandboxes.length === 0}
              >
                <Trash2 className="h-3 w-3" />
                Delete all
              </Button>
            </div>

            {sandboxes.length === 0 ? (
              <div className="rounded-sm border border-border px-3 py-4 text-sm text-fg-500">
                No saved sandboxes.
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-sm border border-border">
                {sandboxes.map((sandbox) => {
                  const isCurrentSandbox = sandbox.sandboxId === sandboxId;
                  const isActionLoading =
                    sandboxActionId === sandbox.sandboxId || isLoading;
                  const canResume =
                    sandbox.state === "running" || sandbox.state === "paused";
                  const canPause =
                    sandbox.state === "running" && !isCurrentSandbox;

                  return (
                    <div
                      key={sandbox.sandboxId}
                      className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1.2fr)_auto] md:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="truncate font-mono text-sm text-fg"
                            title={sandbox.sandboxId}
                          >
                            {shortSandboxId(sandbox.sandboxId)}
                          </span>
                          <Badge variant={getSandboxStateVariant(sandbox.state)}>
                            {sandbox.state}
                          </Badge>
                          {isCurrentSandbox && (
                            <Badge variant="accent">active</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-500">
                          <span>Created {formatSandboxDate(sandbox.createdAt)}</span>
                          <span>Last used {formatSandboxDate(sandbox.lastSeenAt)}</span>
                          <span>Expires {formatSandboxDate(sandbox.expiresAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button
                          onClick={() => resumeSandbox(sandbox.sandboxId)}
                          variant="accent"
                          size="sm"
                          disabled={!canResume || isCurrentSandbox}
                          loading={isActionLoading && !isCurrentSandbox}
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </Button>
                        <Button
                          onClick={() => pauseSandbox(sandbox.sandboxId)}
                          variant="muted"
                          size="sm"
                          disabled={!canPause}
                          loading={isActionLoading && canPause}
                        >
                          <Pause className="h-3 w-3" />
                          Pause
                        </Button>
                        <Button
                          onClick={() => deleteSandbox(sandbox.sandboxId)}
                          variant="error"
                          size="sm"
                          loading={sandboxActionId === sandbox.sandboxId}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="h-dvh w-screen overflow-hidden bg-bg">
      <Frame
        showChrome={false}
        classNames={{
          wrapper: "h-full w-full pb-0",
          frame: "flex h-full flex-col overflow-hidden rounded-none border-0 shadow-none",
        }}
      >
        <div className="border-b w-full px-2 sm:px-3 py-2 flex items-center justify-between h-auto">
          <div className="flex flex-1 items-center text-base sm:text-lg truncate">
            <Link
              href="/"
              className="flex items-center gap-1 sm:gap-2"
              target="_blank"
            >
              <Logo width={20} height={20} className="sm:w-6 sm:h-6" />
              <h1 className="whitespace-pre">Invoke - Paychex ADP Agent</h1>
            </Link>
          </div>

          <div className="md:hidden">
            <Button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              variant="ghost"
              size="icon"
              className="mr-1"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <AccountControls />
            <ThemeToggle />
            <Button
              onClick={() => setIsHistoryOpen((open) => !open)}
              variant="muted"
              title="Saved sandboxes"
            >
              <History className="h-3 w-3" />
              Sandboxes
            </Button>

            {!sandboxId && latestResumableSandbox && (
              <Button
                onClick={resumeLatestSandbox}
                variant="accent"
                loading={isLoading}
                title="Resume latest saved sandbox"
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
            )}

            <AnimatePresence>
              {sandboxId && (
                <motion.div
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button variant="muted" title="Sandbox time remaining">
                    <Timer
                      className={`h-3 w-3 ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    />
                    <span
                      className={`text-xs font-medium ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    >
                      {formatTimeRemaining(timeRemaining)}
                    </span>
                  </Button>

                  <Select
                    value={String(selectedTimeoutMs)}
                    onValueChange={handleTimeoutChange}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs" title="Set sandbox lifetime">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SANDBOX_TIMEOUT_OPTIONS.map((option) => (
                        <SelectItem key={option.ms} value={String(option.ms)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleExportDownloads}
                    variant="muted"
                    title="Download Paychex files from sandbox"
                  >
                    <Download className="w-3 h-3" />
                    Downloads
                  </Button>

                  <Button
                    onClick={() => pauseSandbox(sandboxId)}
                    variant="muted"
                    className="text-xs"
                    loading={sandboxActionId === sandboxId}
                  >
                    <Pause className="w-3 h-3" />
                    Pause
                  </Button>

                  <Button
                    onClick={stopSandbox}
                    variant="error"
                    className="text-xs"
                  >
                    <Power className="w-3 h-3" />
                    Stop
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="lg:hidden flex items-center">
            <AnimatePresence>
              {!sandboxId && latestResumableSandbox && (
                <motion.div
                  className="flex items-center gap-1"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    onClick={resumeLatestSandbox}
                    variant="accent"
                    size="sm"
                    className="px-1.5"
                    loading={isLoading}
                    title="Resume latest saved sandbox"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </motion.div>
              )}

              {sandboxId && (
                <motion.div
                  className="flex items-center gap-1"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    variant="muted"
                    size="sm"
                    title="Sandbox time remaining"
                    className="px-1.5"
                  >
                    <Timer
                      className={`h-3 w-3 ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    />
                    <span
                      className={`text-xs font-medium ml-1 ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    >
                      {formatTimeRemaining(timeRemaining)}
                    </span>
                  </Button>

                  <Select
                    value={String(selectedTimeoutMs)}
                    onValueChange={handleTimeoutChange}
                  >
                    <SelectTrigger
                      className="h-7 w-24 px-1.5 text-xs"
                      title="Set sandbox lifetime"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SANDBOX_TIMEOUT_OPTIONS.map((option) => (
                        <SelectItem key={option.ms} value={String(option.ms)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleExportDownloads}
                    variant="muted"
                    size="sm"
                    title="Download Paychex files from sandbox"
                    className="px-1.5"
                  >
                    <Download className="w-3 h-3" />
                  </Button>

                  <Button
                    onClick={() => pauseSandbox(sandboxId)}
                    variant="muted"
                    size="sm"
                    title="Pause sandbox"
                    loading={sandboxActionId === sandboxId}
                    className="px-1.5"
                  >
                    <Pause className="w-3 h-3" />
                  </Button>

                  <Button
                    onClick={stopSandbox}
                    variant="error"
                    size="sm"
                    className="text-xs px-1.5"
                  >
                    <Power className="w-3 h-3" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="lg:hidden border-b p-2 flex items-center justify-between"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2">
                <AccountControls />
                <ThemeToggle />
              </div>
              <Button
                onClick={() => setIsHistoryOpen((open) => !open)}
                variant="muted"
                size="sm"
              >
                <History className="h-3 w-3" />
                Sandboxes
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <SandboxHistoryPanel />

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          <div
            ref={iFrameWrapperRef}
            className="relative w-full lg:flex-[1.65] h-[40vh] lg:h-auto overflow-hidden"
          >
            {isLoading || (chatLoading && !sandboxId) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-light text-accent">
                    {isLoading ? "Starting instance" : "Creating sandbox..."}
                  </h2>
                  <Loader variant="square" className="text-accent" />
                </div>

                <AssemblyLoader
                  className="mt-4 text-fg-300"
                  gridWidth={8}
                  gridHeight={4}
                  filledChar="■"
                  emptyChar="□"
                />

                <p className="text-sm text-fg-500 mt-4">
                  {isLoading
                    ? "Preparing your sandbox environment..."
                    : "Installing Chrome and opening Paychex Flex..."}
                </p>
              </div>
            ) : sandboxId && vncUrl ? (
              <iframe
                ref={iframeRef}
                src={vncUrl}
                className="h-full w-full border-0"
                allow="clipboard-read; clipboard-write"
                scrolling="no"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Logo width={96} height={96} className="h-24 w-24" />
                <h1 className="text-center text-fg max-w-xs">
                  {PAYCHEX_FLOW_TITLE}
                </h1>
              </div>
            )}
          </div>

          <div className="flex flex-col relative border-t lg:border-t-0 lg:border-l overflow-hidden h-[60vh] lg:h-auto lg:w-[28rem] lg:max-w-[32rem] lg:shrink-0">
            <ChatList className="flex-1" messages={messages} />

            <ChatInput
              input={input}
              setInput={setInput}
              onSubmit={onSubmit}
              isLoading={chatLoading}
              onStop={stopGeneration}
              disabled={isLoading && !sandboxId}
              className="absolute bottom-3 left-3 right-3"
            />
          </div>
        </div>
      </Frame>
    </div>
  );
}
