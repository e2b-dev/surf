"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  MoonIcon,
  SunIcon,
  Timer,
  Power,
  Menu,
  X,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { increaseTimeout, logoutAction, stopSandboxAction } from "@/app/actions";
import { motion, AnimatePresence } from "framer-motion";
import { ChatList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/input";
import { useChat } from "@/lib/chat-context";
import Frame from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Loader, AssemblyLoader } from "@/components/loader";
import Link from "next/link";
import Logo from "@/components/logo";
import { RepoBanner } from "@/components/repo-banner";
import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import {
  PAYCHEX_ADP_FLOW_PROMPT,
  PAYCHEX_FLOW_TITLE,
  PAYCHEX_LOGIN_URL,
} from "@/lib/paychex-flow";

interface AppShellProps {
  userEmail: string;
}

export default function AppShell({ userEmail }: AppShellProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [timeRemaining, setTimeRemaining] = useState<number>(
    SANDBOX_TIMEOUT_MS / 1000
  );
  const [isTabVisible, setIsTabVisible] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iFrameWrapperRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasAutoStartedRef = useRef(false);

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
          setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
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

  const handleIncreaseTimeout = useCallback(async () => {
    if (!sandboxId) return;

    try {
      await increaseTimeout(sandboxId);
      setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
      toast.success("Instance time increased");
    } catch (error) {
      console.error("Failed to increase time:", error);
      toast.error("Failed to increase time");
    }
  }, [sandboxId]);

  const onSubmit = (e: React.FormEvent) => {
    const content = handleSubmit(e);
    if (content) {
      const width =
        iFrameWrapperRef.current?.clientWidth ||
        (window.innerWidth < 768 ? window.innerWidth - 32 : 1024);
      const height =
        iFrameWrapperRef.current?.clientHeight ||
        (window.innerWidth < 768
          ? Math.min(window.innerHeight * 0.4, 400)
          : 768);

      sendMessage({
        content,
        sandboxId: sandboxId || undefined,
        environment: "linux",
        resolution: [width, height],
      });
    }
  };

  const startPaychexFlow = useCallback(() => {
    const width =
      iFrameWrapperRef.current?.clientWidth ||
      (window.innerWidth < 768 ? window.innerWidth - 32 : 1024);
    const height =
      iFrameWrapperRef.current?.clientHeight ||
      (window.innerWidth < 768 ? Math.min(window.innerHeight * 0.4, 400) : 768);

    sendMessage({
      content: PAYCHEX_ADP_FLOW_PROMPT,
      sandboxId: sandboxId || undefined,
      environment: "linux",
      resolution: [width, height],
      hidden: true,
      bootstrap: "paychex",
    });
  }, [sandboxId, sendMessage]);

  const handleSandboxCreated = (newSandboxId: string, newVncUrl: string) => {
    setSandboxId(newSandboxId);
    setVncUrl(newVncUrl);
    setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
    toast.success("Sandbox instance created");
  };

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

  useEffect(() => {
    if (!sandboxId) return;
    const interval = setInterval(() => {
      if (isTabVisible) {
        setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sandboxId, isTabVisible]);

  useEffect(() => {
    if (!sandboxId) return;

    if (timeRemaining === 10 && isTabVisible) {
      handleIncreaseTimeout();
    }

    if (timeRemaining === 0) {
      setSandboxId(null);
      setVncUrl(null);
      clearMessages();
      stopGeneration();
      toast.error("Instance time expired");
      setTimeRemaining(SANDBOX_TIMEOUT_MS / 1000);
    }
  }, [
    timeRemaining,
    sandboxId,
    stopGeneration,
    clearMessages,
    isTabVisible,
    handleIncreaseTimeout,
  ]);

  useEffect(() => {
    onSandboxCreated((newSandboxId: string, newVncUrl: string) => {
      handleSandboxCreated(newSandboxId, newVncUrl);
    });
  }, [onSandboxCreated]);

  useEffect(() => {
    if (hasAutoStartedRef.current || chatLoading || sandboxId) return;

    hasAutoStartedRef.current = true;
    startPaychexFlow();
  }, [chatLoading, sandboxId, startPaychexFlow]);

  return (
    <div className="w-full flex justify-center items-center h-dvh overflow-hidden p-2 sm:p-4 md:p-8 md:pb-10">
      <Frame
        classNames={{
          wrapper: "w-full max-lg:h-full lg:aspect-[18/9] max-w-[2000px]",
          frame: "flex flex-col h-full overflow-hidden",
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
            <RepoBanner />

            <AnimatePresence>
              {sandboxId && (
                <motion.div
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    onClick={handleIncreaseTimeout}
                    variant="muted"
                    title={
                      isTabVisible
                        ? "Increase Time"
                        : "Timer paused (tab not active)"
                    }
                  >
                    <Timer
                      className={`h-3 w-3 ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    />
                    <span
                      className={`text-xs font-medium ${!isTabVisible ? "text-fg-400" : ""
                        }`}
                    >
                      {Math.floor(timeRemaining / 60)}:
                      {(timeRemaining % 60).toString().padStart(2, "0")}
                      {!isTabVisible && " (paused)"}
                    </span>
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
                    onClick={handleIncreaseTimeout}
                    variant="muted"
                    size="sm"
                    title={
                      isTabVisible
                        ? "Increase Time"
                        : "Timer paused (tab not active)"
                    }
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
                      {Math.floor(timeRemaining / 60)}:
                      {(timeRemaining % 60).toString().padStart(2, "0")}
                    </span>
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
                <RepoBanner />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          <div
            ref={iFrameWrapperRef}
            className="relative w-full lg:flex-1 h-[40vh] lg:h-auto overflow-hidden"
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
                className="w-full h-full"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Logo width={96} height={96} className="h-24 w-24" />
                <h1 className="text-center text-fg-300 max-w-xs">
                  <span className="text-fg">{PAYCHEX_FLOW_TITLE}</span> starts
                  a new{" "}
                  <a
                    href="https://github.com/Invoke-Pub-Sec-AI/surf"
                    className="underline inline-flex items-center gap-1 decoration-accent decoration-1 underline-offset-2 text-accent"
                    target="_blank"
                  >
                    sandbox <ArrowUpRight className="size-4" />
                  </a>
                  {" "}and opens Paychex Flex in Chrome at {PAYCHEX_LOGIN_URL}.
                </h1>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col relative border-t lg:border-t-0 lg:border-l overflow-hidden h-[60vh] lg:h-auto lg:max-w-xl">
            <ChatList className="flex-1" messages={messages} />

            <ChatInput
              input={input}
              setInput={setInput}
              onSubmit={onSubmit}
              isLoading={chatLoading}
              onStop={stopGeneration}
              disabled={false}
              className="absolute bottom-3 left-3 right-3"
            />
          </div>
        </div>
      </Frame>
    </div>
  );
}
