import { ResponseComputerToolCall } from "openai/resources/responses/responses.mjs";

export type OpenAIComputerAction = ResponseComputerToolCall["action"];

export type OpenAIComputerCall = Omit<ResponseComputerToolCall, "action"> & {
  action?: OpenAIComputerAction;
  actions?: OpenAIComputerAction[];
};

export type NormalizedOpenAIComputerCall = Omit<
  OpenAIComputerCall,
  "action" | "actions"
> & {
  actions: OpenAIComputerAction[];
};

export type OpenAIComputerScreenshotOutput = {
  type: "computer_screenshot";
  image_url: string;
  detail: "original";
};

export type OpenAIComputerCallOutput = {
  call_id: string;
  type: "computer_call_output";
  output: OpenAIComputerScreenshotOutput;
};
