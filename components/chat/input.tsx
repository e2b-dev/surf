"use client";

import React, { useMemo } from "react";
import { OpenAiLogo } from "@phosphor-icons/react";
import { ChevronsRight, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "../ui/select";
import { useChat } from "@/lib/chat-context";
import { Input } from "../ui/input";
import { GoogleLogo } from "../icons";
import { motion } from "motion/react";

interface ChatInputProps {
  input: string;
  setInput: (input: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Chat input component with submit and stop buttons
 */
export function ChatInput({
  input,
  setInput,
  onSubmit,
  isLoading,
  onStop,
  disabled = false,
  placeholder = "What are we surfing today?",
  className,
}: ChatInputProps) {
  const { model, setModel } = useChat();

  const isInputEmpty = useMemo(() => input.trim() === "", [input]);

  return (
    <form onSubmit={onSubmit} className={cn(className)}>
      <div className="flex items-center">
        <div className="relative flex-1 flex items-center gap-2">
          <Select value={model} onValueChange={setModel} disabled={disabled}>
            <SelectTrigger
              className="absolute rounded-lg left-1.5 z-10 inset-y-1.5 border-border-200 w-min aspect-square h-auto flex items-center justify-center hover:bg-bg focus:bg-bg"
              withIcon={false}
            >
              {model === "openai" ? (
                <OpenAiLogo className="size-5" />
              ) : model === "google" ? (
                <GoogleLogo className="size-5" />
              ) : null}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Model</SelectLabel>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="google">Google Gemini</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            required
            disabled={disabled}
            className="w-full pl-16 pr-16"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading ? (
              <Button
                type="button"
                onClick={onStop}
                variant="error"
                size="iconLg"
                disabled={disabled}
                title="Stop generating"
              >
                <StopCircle className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="accent"
                size="iconLg"
                disabled={disabled || isInputEmpty}
                title="Send message"
              >
                <motion.span
                  animate={{
                    rotate: isInputEmpty ? 0 : -90,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 20,
                  }}
                >
                  <ChevronsRight className="w-5 h-5" />
                </motion.span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
