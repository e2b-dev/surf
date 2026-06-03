"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  MoonIcon,
  SunIcon,
  Timer,
  Power,
  Download,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ensureSandboxAction,
  increaseTimeout,
  logoutAction,
  resizeSandboxDisplayAction,
  stopSandboxAction,
} from "@/app/actions";
import { motion, AnimatePresence } from "framer-motion";
import { ChatList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/input";
import { useChat } from "@/lib/chat-context";
import Frame from "@/components/frame";
import { Button } from "@/components/ui/button";
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
        stopGeneration();
        const success = await stopSandboxAction(sandboxId);
        if (success) {
          setSandboxId(null);
          setVncUrl(null);
          clearMessages();
          setSelectedTimeoutMs(SANDBOX_TIMEOUT_MS);
          setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
          setExpiresAtMs(Date.now() + SANDBOX_TIMEOUT_MS);
          lastLeaseRenewedAtRef.current = null;
          lastDisplayResizeRef.current = null;
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

  const handleSandboxCreated = (newSandboxId: string, newVncUrl: string) => {
    setSandboxId(newSandboxId);
    setVncUrl(newVncUrl);
    setSelectedTimeoutMs(SANDBOX_TIMEOUT_MS);
    setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
    setExpiresAtMs(Date.now() + SANDBOX_TIMEOUT_MS);
    lastLeaseRenewedAtRef.current = Date.now();
    lastDisplayResizeRef.current = null;
    toast.success("Sandbox instance created");
  };

  const startOrResumeSandbox = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await ensureSandboxAction({
        resolution: getSandboxResolution(),
      });

      if (result.ok) {
        setSandboxId(result.sandboxId);
        setVncUrl(result.vncUrl);
        setSelectedTimeoutMs(result.timeoutMs);
        setTimeRemaining(result.timeRemainingSeconds);
        setExpiresAtMs(Date.parse(result.expiresAt));
        lastLeaseRenewedAtRef.current = Date.now();
        lastDisplayResizeRef.current = null;
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Failed to start or resume sandbox:", error);
      toast.error("Failed to start sandbox");
    } finally {
      setIsLoading(false);
    }
  }, [getSandboxResolution]);

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
      setSandboxId(null);
      setVncUrl(null);
      clearMessages();
      stopGeneration();
      toast.error("Instance time expired");
      setSelectedTimeoutMs(SANDBOX_TIMEOUT_MS);
      setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
      setExpiresAtMs(Date.now() + SANDBOX_TIMEOUT_MS);
      lastLeaseRenewedAtRef.current = null;
      lastDisplayResizeRef.current = null;
    }
  }, [
    timeRemaining,
    sandboxId,
    stopGeneration,
    clearMessages,
  ]);

  useEffect(() => {
    onSandboxCreated((newSandboxId: string, newVncUrl: string) => {
      handleSandboxCreated(newSandboxId, newVncUrl);
    });
  }, [onSandboxCreated]);

  useEffect(() => {
    if (hasAutoStartedRef.current || chatLoading || sandboxId) return;

    hasAutoStartedRef.current = true;
    startOrResumeSandbox();
  }, [chatLoading, sandboxId, startOrResumeSandbox]);

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
            </motion.div>
          )}
        </AnimatePresence>

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
