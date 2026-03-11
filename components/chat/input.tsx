"use client";

import React, { useMemo } from "react";
import { ChevronsRight, StopCircle, ChevronDown } from "lucide-react";
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
import { ComputerModel } from "@/types/api";
import { Input } from "../ui/input";
import { motion } from "motion/react";

const MODEL_LABELS: Record<ComputerModel, string> = {
  "gpt-5.4": "GPT-5.4",
  openai: "OpenAI CUA",
  anthropic: "Anthropic",
};

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
      <div className="flex flex-col gap-1.5">
        <Select
          value={model}
          onValueChange={(v) => setModel(v as ComputerModel)}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-fit h-auto px-2 py-1 rounded-md border-none bg-transparent hover:bg-bg-200 text-fg-300 hover:text-fg gap-1"
            withIcon={false}
          >
            <span className="text-xs font-mono tracking-wide">
              {MODEL_LABELS[model]}
            </span>
            <ChevronDown className="size-3 text-fg-400" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Model</SelectLabel>
              <SelectItem value="gpt-5.4">GPT-5.4</SelectItem>
              <SelectItem value="openai">OpenAI CUA</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="relative flex items-center">
          <Input
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            required
            disabled={disabled}
            className="w-full pr-16"
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
