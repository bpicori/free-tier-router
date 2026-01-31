/**
 * OpenAI-compatible types for chat completions
 * Based on OpenAI API specification
 */

export type ChatCompletionRole = "system" | "user" | "assistant" | "tool";

export interface ChatCompletionMessage {
  role: ChatCompletionRole;
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ResponseFormat {
  type: "text" | "json_object";
}

/**
 * Request for chat completion
 */
export interface ChatCompletionRequest {
  /** Model identifier or generic model name (e.g., "best-large") */
  model: string;
  /** Messages in the conversation */
  messages: ChatCompletionMessage[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Nucleus sampling parameter */
  top_p?: number;
  /** Number of completions to generate */
  n?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Stop sequences */
  stop?: string | string[];
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Presence penalty (-2 to 2) */
  presence_penalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequency_penalty?: number;
  /** Logit bias for token manipulation */
  logit_bias?: Record<string, number>;
  /** User identifier for abuse tracking */
  user?: string;
  /** Tools available for the model */
  tools?: Tool[];
  /** How to handle tool calls */
  tool_choice?: "none" | "auto" | { type: "function"; function: { name: string } };
  /** Response format */
  response_format?: ResponseFormat;
  /** Random seed for deterministic outputs */
  seed?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  logprobs?: null;
}

export interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Response from chat completion (non-streaming)
 */
export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: CompletionUsage;
  system_fingerprint?: string;
}

/**
 * Delta for streaming responses
 */
export interface ChatCompletionDelta {
  role?: ChatCompletionRole;
  content?: string | null;
  tool_calls?: Partial<ToolCall>[];
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionDelta;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  logprobs?: null;
}

/**
 * Streaming chunk response
 */
export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  system_fingerprint?: string;
  /** Usage is only present in the final chunk when stream_options.include_usage is true */
  usage?: CompletionUsage | null;
}
