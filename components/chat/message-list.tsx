"use client";

import React, { useRef, useEffect } from "react";
import { ChatMessage } from "@/components/chat/message";
import { ChatMessage as ChatMessageType } from "@/types/chat";
import { getVisibleChatMessages } from "@/lib/chat-messages";
import { cn } from "@/lib/utils";

interface ChatListProps {
  messages: ChatMessageType[];
  className?: string;
}

export function ChatList({ messages, className }: ChatListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleMessages = getVisibleChatMessages(messages);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className={cn("overflow-y-auto p-4 pb-22", "space-y-4", className)}
    >
      {visibleMessages.length !== 0 &&
        visibleMessages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            className="animate-fade-slide-in"
          />
        ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
