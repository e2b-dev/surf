"use client";

import React from "react";
import {
  ChatMessage as ChatMessageType,
  ActionChatMessage,
  AssistantChatMessage,
} from "@/types/chat";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";
import {
  Terminal,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Info,
} from "lucide-react";
import { useChat } from "@/lib/chat-context";
import { Badge } from "../ui/badge";
import { OpenAiLogo } from "@phosphor-icons/react";
import { AnthropicLogo } from "../icons";

const messageVariants = cva("", {
  variants: {
    role: {
      user: "bg-accent/15 text-accent-fg border-accent-300",
      assistant: "bg-bg-100 text-fg border-border-100",
      system: "bg-bg-100 text-fg-300 border-border italic",
    },
  },
  defaultVariants: {
    role: "system",
  },
});

interface ChatMessageProps extends VariantProps<typeof messageVariants> {
  message: ChatMessageType;
  className?: string;
}

function ActionMessageDisplay({
  message,
  className,
}: {
  message: ActionChatMessage;
  className?: string;
}) {
  const { action, repeatCount, status } = message;

  const formatAction = (action: any, repeats?: number): string => {
    if (!action) return "No action details";

    if (action.type === "wait") {
      return repeats && repeats > 1 ? `wait x${repeats}` : "wait";
    }

    try {
      return JSON.stringify(action, null, 2);
    } catch (e) {
      return "Unable to display action details";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-3 w-3 text-success" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-error" />;
      case "pending":
        return <Clock className="h-3 w-3 text-warning animate-pulse" />;
      default:
        return null;
    }
  };

  return (
    <div className={cn("flex justify-start", className)}>
      <Card
        className="max-w-[85%] overflow-hidden border border-border-200 bg-bg-100 dark:bg-bg-200"
        variant="slate"
      >
        <CardContent className="p-3">
          <div className="text-xs mb-2 font-mono uppercase tracking-wider text-fg-300 flex items-center gap-1">
            <Terminal className="h-3 w-3" />
            <span>Action</span>
            {status && (
              <div className="ml-2 flex items-center gap-1">
                {getStatusIcon()}
                <span className="text-xs capitalize">{status}</span>
              </div>
            )}
          </div>

          <div className="bg-bg-200 dark:bg-bg-300 p-2 rounded font-mono text-xs tracking-wide text-fg-100 overflow-x-auto mb-3">
            <code>{formatAction(action, repeatCount)}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  const role = message.role;

  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isAction = role === "action";
  const isSystem = role === "system";
  const isError = "isError" in message && message.isError;

  const { model } = useChat();

  if (isSystem) {
    return (
      <div className={cn("w-full flex justify-center", className)}>
        <Badge variant={isError ? "error" : "muted"}>{message.content}</Badge>
      </div>
    );
  }

  if (isAction) {
    return (
      <ActionMessageDisplay
        message={message as ActionChatMessage<typeof model>}
        className={className}
      />
    );
  }

  const getRoleIcon = () => {
    if (isUser) return <User className="h-3 w-3" />;
    if (isAssistant) {
      if ((message as AssistantChatMessage).model === "openai") {
        return <OpenAiLogo className="h-3 w-3" />;
      } else {
        return <AnthropicLogo className="h-3 w-3" />;
      }
    }
    return <Info className="h-3 w-3" />;
  };

  const roleLabel = isUser ? "You" : isAssistant ? "Assistant" : "System";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <Card
        className={cn(
          "max-w-[85%] overflow-hidden border",
          messageVariants({ role })
        )}
        variant="slate"
      >
        <CardContent className="p-3">
          <div className="text-xs mb-2 font-mono uppercase tracking-wider text-fg-300 flex items-center gap-1">
            {getRoleIcon()}
            <span>{roleLabel}</span>
          </div>
          <div className="whitespace-pre-wrap break-words font-sans text-sm tracking-wide">
            {message.content}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
