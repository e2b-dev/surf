"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  ChatMessage,
  ChatState,
  ParsedSSEEvent,
  SendMessageOptions,
  ActionChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  SystemChatMessage,
} from "@/types/chat";
import { ComputerModel, SSEEventType } from "@/types/api";
import { logDebug, logError } from "./logger";

interface ChatContextType extends ChatState {
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  setInput: (input: string) => void;
  input: string;
  handleSubmit: (e: React.FormEvent) => string | undefined;
  onSandboxCreated: (
    callback: (sandboxId: string, vncUrl: string) => void
  ) => void;
  model: ComputerModel;
  setModel: (model: ComputerModel) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSandboxCreatedRef = useRef<
    ((sandboxId: string, vncUrl: string) => void) | undefined
  >(undefined);
  const [model, setModel] = useState<ComputerModel>("google");

  const parseSSEEvent = (data: string): ParsedSSEEvent<typeof model> | null => {
    try {
      if (!data || data.trim() === "") {
        return null;
      }

      if (data.startsWith("data: ")) {
        const jsonStr = data.substring(6).trim();

        if (!jsonStr) {
          return null;
        }

        return JSON.parse(jsonStr);
      }

      const match = data.match(/data: ({.*})/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }

      return JSON.parse(data);
    } catch (e) {
      logError(
        "Error parsing SSE event:",
        e,
        "Data:",
        data.substring(0, 200) + (data.length > 200 ? "..." : "")
      );
      return null;
    }
  };

  const sendMessage = async ({
    content,
    sandboxId,
    environment,
    resolution,
  }: SendMessageOptions) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      role: "user",
      content,
      id: Date.now().toString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    abortControllerRef.current = new AbortController();

    try {
      const apiMessages = messages
        .concat(userMessage)
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => {
          const typedMsg = msg as UserChatMessage | AssistantChatMessage;
          return {
            role: typedMsg.role,
            content: typedMsg.content,
          };
        });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          sandboxId,
          environment,
          resolution,
          model,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is null");

      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          id: `system-message-${Date.now()}`,
          content: "Task started",
        },
      ]);

      const decoder = new TextDecoder();
      let assistantMessage = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const parsedEvent = parseSSEEvent(buffer);
            if (parsedEvent) {
              if (parsedEvent.type === SSEEventType.DONE) {
                setMessages((prev) => {
                  const systemMessage: SystemChatMessage = {
                    role: "system",
                    id: `system-${Date.now()}`,
                    content: "Task completed",
                  };

                  return [...prev, systemMessage];
                });
                setIsLoading(false);
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const events = buffer.split("\n\n");

        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.trim()) continue;

          const parsedEvent = parseSSEEvent(event);
          if (!parsedEvent) continue;

          if (process.env.NODE_ENV === "development") {
            logDebug("Parsed event:", parsedEvent);
          }

          switch (parsedEvent.type) {
            case SSEEventType.ACTION:
              if (parsedEvent.action) {
                const actionMessage: ActionChatMessage<typeof model> = {
                  role: "action",
                  id: `action-${Date.now()}`,
                  action: parsedEvent.action,
                  status: "pending",
                  model,
                };

                setMessages((prev) => [...prev, actionMessage]);
              }
              break;

            case SSEEventType.REASONING:
              if (typeof parsedEvent.content === "string") {
                assistantMessage = parsedEvent.content;
                const reasoningMessage: AssistantChatMessage = {
                  role: "assistant",
                  id: `assistant-${Date.now()}-${messages.length}`,
                  content: assistantMessage,
                  model,
                };
                setMessages((prev) => [...prev, reasoningMessage]);
              }
              break;

            case SSEEventType.DONE:
              setMessages((prev) => {
                const systemMessage: SystemChatMessage = {
                  role: "system",
                  id: `system-${Date.now()}`,
                  content: parsedEvent.content || "Task completed",
                };

                return [...prev, systemMessage];
              });
              setIsLoading(false);
              break;

            case SSEEventType.ERROR:
              setError(parsedEvent.content);
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  id: `system-${Date.now()}`,
                  content: parsedEvent.content,
                  isError: true,
                },
              ]);
              setIsLoading(false);
              break;

            case SSEEventType.SANDBOX_CREATED:
              if (
                parsedEvent.sandboxId &&
                parsedEvent.vncUrl &&
                onSandboxCreatedRef.current
              ) {
                onSandboxCreatedRef.current(
                  parsedEvent.sandboxId,
                  parsedEvent.vncUrl
                );
              }
              break;

            case SSEEventType.ACTION_COMPLETED:
              setMessages((prev) => {
                const lastActionIndex = [...prev]
                  .reverse()
                  .findIndex((msg) => msg.role === "action");

                if (lastActionIndex !== -1) {
                  const actualIndex = prev.length - 1 - lastActionIndex;

                  return prev.map((msg, index) =>
                    index === actualIndex
                      ? { ...msg, status: "completed" }
                      : msg
                  );
                }

                return prev;
              });
              break;
          }
        }
      }
    } catch (error) {
      logError("Error sending message:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort(
          new DOMException("Generation stopped by user", "AbortError")
        );
        setIsLoading(false);
      } catch (error) {
        logError("Error stopping generation:", error);
        setIsLoading(false);
      }
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent): string | undefined => {
      e.preventDefault();
      if (!input.trim()) return;

      const content = input.trim();
      setInput("");
      return content;
    },
    [input]
  );

  const value = {
    messages,
    isLoading,
    error,
    input,
    setInput,
    sendMessage,
    stopGeneration,
    clearMessages,
    handleSubmit,
    model,
    setModel,
    onSandboxCreated: (
      callback: (sandboxId: string, vncUrl: string) => void
    ) => {
      onSandboxCreatedRef.current = callback;
    },
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
