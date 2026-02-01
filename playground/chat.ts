/**
 * Terminal Chat App using Free Tier Router
 *
 * A simple interactive chat interface for conversing with LLMs.
 * Includes debug logging to inspect router behavior.
 *
 * Usage:
 *   1. Copy .env.example to .env and add your API keys
 *   2. Run: npm run playground:chat
 *
 * Or run directly with:
 *   tsx --env-file=playground/.env playground/chat.ts
 *
 * Commands:
 *   /quit, /exit    - Exit the chat
 *   /clear          - Clear conversation history
 *   /model <name>   - Switch to a different model
 *   /models         - List available models
 *   /status         - Show current model and message count
 *   /debug          - Toggle debug mode (show routing info)
 *   /quota          - Show rate limit quota status
 *   /help           - Show available commands
 */

import * as readline from "readline";
import { createRouter, type Router } from "../src/router.js";
import type { ProviderConfig } from "../src/types/config.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { setDebugEnabled } from "../src/utils/debug.js";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type ChatState = {
  readonly messages: ReadonlyArray<ChatCompletionMessageParam>;
  readonly model: string;
  readonly running: boolean;
  readonly debug: boolean;
};

type CommandResult =
  | { type: "continue"; state: ChatState }
  | { type: "exit" }
  | { type: "send"; state: ChatState };

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;

const DEFAULT_MODEL = "best";
const SYSTEM_PROMPT =
  "You are a helpful AI assistant. Be concise and clear in your responses.";

// ─────────────────────────────────────────────────────────────────
// Display Helpers
// ─────────────────────────────────────────────────────────────────

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

const print = (text: string) => process.stdout.write(text);
const println = (text: string = "") => console.log(text);

const printColored = (color: keyof typeof colors, text: string) =>
  print(`${colors[color]}${text}${colors.reset}`);

const printHeader = () => {
  println();
  printColored(
    "cyan",
    "╔════════════════════════════════════════════════════════╗\n"
  );
  printColored("cyan", "║");
  printColored(
    "bright",
    "          Free Tier Router - Terminal Chat            "
  );
  printColored("cyan", "║\n");
  printColored(
    "cyan",
    "╚════════════════════════════════════════════════════════╝\n"
  );
  println();
};

const printHelp = () => {
  println();
  printColored("yellow", "Available commands:\n");
  println("  /quit, /exit    Exit the chat");
  println("  /clear          Clear conversation history");
  println("  /model <name>   Switch to a different model");
  println("  /models         List available models");
  println("  /status         Show current model and message count");
  println("  /debug          Toggle debug mode (show routing info)");
  println("  /quota          Show rate limit quota status");
  println("  /reset          Clear all cooldowns and rate limit tracking");
  println("  /help           Show this help message");
  println();
};

// ─────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────

const createInitialState = (
  model: string,
  debug: boolean = true
): ChatState => ({
  messages: [{ role: "system", content: SYSTEM_PROMPT }],
  model,
  running: true,
  debug,
});

const addMessage = (
  state: ChatState,
  message: ChatCompletionMessageParam
): ChatState => ({
  ...state,
  messages: [...state.messages, message],
});

const clearMessages = (state: ChatState): ChatState => ({
  ...state,
  messages: [{ role: "system", content: SYSTEM_PROMPT }],
});

const setModel = (state: ChatState, model: string): ChatState => ({
  ...state,
  model,
});

const toggleDebug = (state: ChatState): ChatState => ({
  ...state,
  debug: !state.debug,
});

// ─────────────────────────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────────────────────────

const handleCommand = async (
  input: string,
  state: ChatState,
  router: Router
): Promise<CommandResult> => {
  const [command, ...args] = input.slice(1).split(" ");
  const arg = args.join(" ").trim();

  switch (command?.toLowerCase()) {
    case "quit":
    case "exit":
      return { type: "exit" };

    case "clear":
      println();
      printColored("green", "Conversation cleared.\n");
      return { type: "continue", state: clearMessages(state) };

    case "model":
      if (!arg) {
        printColored("yellow", `\nCurrent model: ${state.model}\n`);
        println("Usage: /model <model-name>");
        return { type: "continue", state };
      }
      if (!router.isModelAvailable(arg)) {
        printColored("red", `\nModel '${arg}' is not available.\n`);
        println("Use /models to see available models.");
        return { type: "continue", state };
      }
      println();
      printColored("green", `Switched to model: ${arg}\n`);
      return { type: "continue", state: setModel(state, arg) };

    case "models": {
      println();
      printColored("yellow", "Available models:\n");
      const models = router.listModels();
      const grouped = models.reduce(
        (acc, m) => {
          const tier = m.qualityTier;
          if (!acc[tier]) acc[tier] = [];
          acc[tier].push(m.id);
          return acc;
        },
        {} as Record<number, string[]>
      );
      for (const tier of [5, 4, 3, 2, 1]) {
        if (grouped[tier]) {
          printColored("dim", `  Tier ${tier}: `);
          println(grouped[tier].join(", "));
        }
      }
      println();
      printColored("dim", "  Aliases: ");
      println("fast, best, reasoning");
      println();
      return { type: "continue", state };
    }

    case "status":
      println();
      printColored("yellow", "Status:\n");
      println(`  Model: ${state.model}`);
      println(`  Messages: ${state.messages.length - 1}`); // Exclude system prompt
      println(`  Debug: ${state.debug ? "ON" : "OFF"}`);
      println();
      return { type: "continue", state };

    case "debug": {
      const newState = toggleDebug(state);
      println();
      printColored("green", `Debug mode: ${newState.debug ? "ON" : "OFF"}\n`);
      if (newState.debug) {
        printColored(
          "dim",
          "Routing info will be shown after each response.\n"
        );
      }
      println();
      return { type: "continue", state: newState };
    }

    case "quota": {
      println();
      printColored("yellow", "Rate Limit Quota Status:\n");
      println();
      try {
        const status = await router.getQuotaStatus();
        for (const { provider, model, quota } of status) {
          printColored("cyan", `  ${provider}/${model}\n`);
          const reqMin = quota.requestsRemaining.minute;
          const reqDay = quota.requestsRemaining.day;
          const tokMin = quota.tokensRemaining.minute;
          const tokDay = quota.tokensRemaining.day;
          printColored("dim", "    Requests: ");
          println(`${reqMin ?? "∞"}/min, ${reqDay ?? "∞"}/day`);
          printColored("dim", "    Tokens: ");
          println(`${tokMin ?? "∞"}/min, ${tokDay ?? "∞"}/day`);
          if (quota.cooldownUntil) {
            printColored("red", "    Cooldown until: ");
            println(quota.cooldownUntil.toISOString());
          }
        }
      } catch (error) {
        printColored(
          "red",
          `Error getting quota: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
      println();
      return { type: "continue", state };
    }

    case "reset": {
      println();
      try {
        await router.clearAllCooldowns();
        printColored(
          "green",
          "All cooldowns and rate limit tracking cleared.\n"
        );
      } catch (error) {
        printColored(
          "red",
          `Error: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
      println();
      return { type: "continue", state };
    }

    case "help":
      printHelp();
      return { type: "continue", state };

    default:
      printColored("red", `\nUnknown command: ${command}\n`);
      println("Type /help for available commands.");
      return { type: "continue", state };
  }
};

// ─────────────────────────────────────────────────────────────────
// Chat Logic
// ─────────────────────────────────────────────────────────────────

const sendMessage = async (
  router: Router,
  state: ChatState,
  userMessage: string
): Promise<ChatState> => {
  const stateWithUser = addMessage(state, {
    role: "user",
    content: userMessage,
  });
  const startTime = Date.now();

  // Show pre-request debug info
  if (state.debug) {
    println();
    printColored(
      "blue",
      "┌─ Request ──────────────────────────────────────────────\n"
    );
    printColored("blue", "│ ");
    printColored("dim", `Model requested: `);
    println(state.model);
    printColored("blue", "│ ");
    printColored("dim", `Messages in context: `);
    println(String(stateWithUser.messages.length));
    printColored(
      "blue",
      "└───────────────────────────────────────────────────────\n"
    );
  }

  println();
  printColored("magenta", "Assistant: ");

  try {
    const { stream, metadata } = await router.createCompletionStream({
      model: state.model,
      messages: [...stateWithUser.messages],
    });

    let assistantResponse = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        print(delta);
        assistantResponse += delta;
      }
    }

    const latencyMs = Date.now() - startTime;

    println();
    println();

    // Show routing debug info
    if (state.debug) {
      printColored(
        "blue",
        "┌─ Routing ─────────────────────────────────────────────\n"
      );
      printColored("blue", "│ ");
      printColored("dim", `Provider: `);
      println(metadata.provider);
      printColored("blue", "│ ");
      printColored("dim", `Actual model: `);
      println(metadata.model);
      printColored("blue", "│ ");
      printColored("dim", `Retries: `);
      println(String(metadata.retryCount));
      printColored("blue", "│ ");
      printColored("dim", `Latency: `);
      println(`${latencyMs}ms`);
      printColored(
        "blue",
        "└───────────────────────────────────────────────────────\n"
      );
      println();
    }

    return addMessage(stateWithUser, {
      role: "assistant",
      content: assistantResponse,
    });
  } catch (error) {
    println();
    printColored(
      "red",
      `\nError: ${error instanceof Error ? error.message : String(error)}\n`
    );

    // Show error details in debug mode
    if (state.debug && error instanceof Error) {
      if (error.cause) {
        printColored("dim", `Cause: ${String(error.cause)}\n`);
      }
      // Show stack trace for debugging
      if (error.stack) {
        println();
        printColored("dim", "Stack trace:\n");
        printColored(
          "dim",
          error.stack.split("\n").slice(0, 5).join("\n") + "\n"
        );
      }
      // Check for nested error details
      const anyError = error as any;
      if (anyError.status) {
        printColored("dim", `HTTP Status: ${anyError.status}\n`);
      }
      if (anyError.error) {
        printColored("dim", `API Error: ${JSON.stringify(anyError.error)}\n`);
      }
    }

    return stateWithUser;
  }
};

// ─────────────────────────────────────────────────────────────────
// Main Loop
// ─────────────────────────────────────────────────────────────────

const createReadlineInterface = () =>
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

const prompt = (rl: readline.Interface, promptText: string): Promise<string> =>
  new Promise((resolve) => rl.question(promptText, resolve));

const runChatLoop = async (
  router: Router,
  initialState: ChatState
): Promise<void> => {
  const rl = createReadlineInterface();
  let state = initialState;

  printColored("dim", `Using model: ${state.model}\n`);
  printColored("dim", `Debug mode: ${state.debug ? "ON" : "OFF"}\n`);
  println("Type /help for commands, or just start chatting!");
  println();

  while (state.running) {
    const input = await prompt(rl, `${colors.green}You: ${colors.reset}`);
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      continue;
    }

    if (trimmedInput.startsWith("/")) {
      const result = await handleCommand(trimmedInput, state, router);

      if (result.type === "exit") {
        break;
      }

      state = result.state;
      continue;
    }

    state = await sendMessage(router, state, trimmedInput);
  }

  rl.close();
  println();
  printColored("cyan", "Goodbye!\n");
  println();
};

// ─────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────

const buildProviders = (): ProviderConfig[] => {
  const providers: ProviderConfig[] = [];

  if (GROQ_API_KEY) {
    providers.push({ type: "groq", apiKey: GROQ_API_KEY });
    printColored("green", "  GROQ_API_KEY found\n");
  } else {
    printColored("dim", "  GROQ_API_KEY not set\n");
  }

  if (CEREBRAS_API_KEY) {
    providers.push({ type: "cerebras", apiKey: CEREBRAS_API_KEY });
    printColored("green", "  CEREBRAS_API_KEY found\n");
  } else {
    printColored("dim", "  CEREBRAS_API_KEY not set\n");
  }

  if (OPENROUTER_API_KEY) {
    providers.push({ type: "openrouter", apiKey: OPENROUTER_API_KEY });
    printColored("green", "  OPENROUTER_API_KEY found\n");
  } else {
    printColored("dim", "  OPENROUTER_API_KEY not set\n");
  }

  if (NVIDIA_NIM_API_KEY) {
    providers.push({ type: "nvidia-nim", apiKey: NVIDIA_NIM_API_KEY });
    printColored("green", "  NVIDIA_NIM_API_KEY found\n");
  } else {
    printColored("dim", "  NVIDIA_NIM_API_KEY not set\n");
  }

  return providers;
};

const main = async (): Promise<void> => {
  // Enable debug logging to see all router internals
  setDebugEnabled(true);

  printHeader();

  const providers = buildProviders();
  println();

  if (providers.length === 0) {
    printColored("red", "No API keys configured!\n");
    println();
    println("To use the chat:");
    println("  1. Copy playground/.env.example to playground/.env");
    println("  2. Add your API keys to the .env file");
    println("  3. Run: npm run playground:chat");
    println();
    process.exit(1);
  }

  const router = createRouter({
    providers,
    strategy: "least-used",
  });

  const initialModel = router.isModelAvailable(DEFAULT_MODEL)
    ? DEFAULT_MODEL
    : "fast";
  const initialState = createInitialState(initialModel);

  try {
    await runChatLoop(router, initialState);
  } finally {
    await router.close();
  }
};

main().catch((error) => {
  printColored(
    "red",
    `Fatal error: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
