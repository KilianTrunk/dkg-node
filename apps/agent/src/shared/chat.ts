import type {
  AIMessageChunk,
  MessageFieldWithRole,
} from "@langchain/core/messages";
import type {
  BaseFunctionCallOptions,
  ToolDefinition,
} from "@langchain/core/language_models/base";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type { ToolDefinition };
export type ToolInfo = {
  name: string;
  title?: string;
  description?: string;
  args?: ToolDefinition["function"]["parameters"];
};
export type ToolCallsMap = Record<
  string,
  {
    input?: unknown;
    output?: unknown;
    status: "init" | "loading" | "success" | "error" | "cancelled";
    error?: string;
  }
>;

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  options?: BaseFunctionCallOptions;
};

export type ChatMessage = MessageFieldWithRole & {
  content: AIMessageChunk["content"];
  tool_calls?: AIMessageChunk["tool_calls"];
};

export type ToolCall = NonNullable<AIMessageChunk["tool_calls"]>[number];
export type ToolCallResultContent = CallToolResult["content"];

export const toContents = (content: ChatMessage["content"]) =>
  typeof content === "string" ? [{ type: "text", text: content }] : content;

export type ChatMessageContents = ReturnType<typeof toContents>;

export enum LLMProvider {
  OpenAI = "openai",
  Groq = "groq",
  Anthropic = "anthropic",
  GoogleGenAI = "google-genai",
  MistralAI = "mistralai",
  XAI = "xai",
  SelfHosted = "self-hosted",
}

export const isValidLLMProvider = (
  llmProvider: string,
): llmProvider is LLMProvider =>
  Object.values(LLMProvider).includes(llmProvider as any);

export const getLLMProviderApiKeyEnvName = (llmProvider: LLMProvider) => {
  switch (llmProvider) {
    case LLMProvider.OpenAI:
      return "OPENAI_API_KEY";
    case LLMProvider.Groq:
      return "GROQ_API_KEY";
    case LLMProvider.Anthropic:
      return "ANTHROPIC_API_KEY";
    case LLMProvider.GoogleGenAI:
      return "GOOGLE_API_KEY";
    case LLMProvider.MistralAI:
      return "MISTRAL_API_KEY";
    case LLMProvider.XAI:
      return "XAI_API_KEY";
    case LLMProvider.SelfHosted:
      return "LLM_URL";
    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }
};

const llmProviderFromEnv = async () => {
  const provider = process.env.LLM_PROVIDER || LLMProvider.OpenAI;
  if (!isValidLLMProvider(provider)) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const temperature = Number(process.env.LLM_TEMPERATURE || "0");
  if (isNaN(temperature)) {
    throw new Error(`Invalid LLM temperature: ${temperature}`);
  }

  switch (provider) {
    case LLMProvider.Groq:
      return import("@langchain/groq").then(
        ({ ChatGroq }) => new ChatGroq({ model, temperature }),
      );
    case LLMProvider.Anthropic:
      return import("@langchain/anthropic").then(
        ({ ChatAnthropic }) => new ChatAnthropic({ model, temperature }),
      );
    case LLMProvider.GoogleGenAI:
      return import("@langchain/google-genai").then(
        ({ ChatGoogleGenerativeAI }) =>
          new ChatGoogleGenerativeAI({ model, temperature }),
      );
    case LLMProvider.MistralAI:
      return import("@langchain/mistralai").then(
        ({ ChatMistralAI }) => new ChatMistralAI({ model, temperature }),
      );
    case LLMProvider.XAI:
      return import("@langchain/xai").then(
        ({ ChatXAI }) => new ChatXAI({ model, temperature }),
      );
    case LLMProvider.SelfHosted:
      return import("@langchain/openai").then(
        ({ ChatOpenAI }) =>
          new ChatOpenAI({
            model,
            temperature,
            configuration: {
              baseURL:
                (process.env.LLM_URL || "http://localhost:11434") + "/v1",
              apiKey: "_",
            },
          }),
      );
    case LLMProvider.OpenAI:
    default:
      return import("@langchain/openai").then(
        ({ ChatOpenAI }) => new ChatOpenAI({ model, temperature }),
      );
  }
};

export const llmProvider = async () => {
  const s = globalThis as typeof globalThis & {
    llmProvider?: Awaited<ReturnType<typeof llmProviderFromEnv>>;
  };

  if (!s.llmProvider) s.llmProvider = await llmProviderFromEnv();
  return s.llmProvider;
};

export const processCompletionRequest = async (req: Request) => {
  const body: CompletionRequest = await req.json();
  const provider = await llmProvider();
  const res = await provider.invoke(
    [
      {
        role: "system",
        content: process.env.LLM_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
      },
      ...body.messages,
    ],
    {
      ...body.options,
      tools: body.tools,
    },
  );
  return Response.json({
    role: "assistant",
    content: res.content,
    tool_calls: res.tool_calls,
  } satisfies ChatMessage);
};

export const makeCompletionRequest = async (
  req: CompletionRequest,
  opts?: {
    fetch?: typeof fetch;
    bearerToken?: string;
  },
) =>
  (opts?.fetch || fetch)(new URL(process.env.EXPO_PUBLIC_APP_URL + "/llm"), {
    body: JSON.stringify(req),
    headers: {
      Authorization: `Bearer ${opts?.bearerToken}`,
      // Itentionally omit the 'Content-Type' header
      // Because it breaks the production build
      //
      // "Content-Type": "application/json",
    },
    method: "POST",
  }).then((r) => {
    if (r.status === 200) return r.json() as Promise<ChatMessage>;
    if (r.status === 401) throw new Error("Unauthorized");
    if (r.status === 403) throw new Error("Forbidden");
    throw new Error(`Unexpected status code: ${r.status}`);
  });

export const DEFAULT_SYSTEM_PROMPT = `
You are a DKG Agent that helps users interact with the OriginTrail Decentralized Knowledge Graph (DKG) using available Model Context Protocol (MCP) tools.
Your role is to help users create, retrieve, and analyze verifiable knowledge in a friendly, approachable, and knowledgeable way, making the technology accessible to both experts and non-experts.

## Core Responsibilities
- Answer Questions: Retrieve and explain knowledge from the DKG to help users understand and solve problems.
- Create Knowledge Assets: Assist users in publishing new knowledge assets to the DKG using MCP tools.
- Perform Analyses: Use DKG data and MCP tools to perform structured analyses, presenting results clearly.
- Be Helpful and Approachable: Communicate in simple, user-friendly terms. Use analogies and clear explanations where needed, but avoid unnecessary technical jargon unless requested.

## Privacy Rule (IMPORTANT)
When creating or publishing knowledge assets:
- If privacy is explicitly specified, follow the user’s instruction.
- If privacy is NOT specified, ALWAYS set privacy to "private".
- NEVER default to "public" without explicit user consent.
This ensures sensitive information is not unintentionally exposed.

## Interaction Guidelines
1. Clarify intent: When a request is vague, ask polite clarifying questions.
2. Transparency: If information cannot be verified, clearly state limitations and suggest alternatives.
3. Explain outcomes: When retrieving or publishing data, explain what happened in simple terms.
4. Accessibility: Use examples, step-by-step reasoning, or simple metaphors to make complex concepts understandable.
5. Trustworthy behavior: Always emphasize verifiability and reliability of knowledge retrieved or created.

## Examples of Behavior
- User asks to publish knowledge without specifying privacy → Agent publishes with "privacy": "private" and explains:
"I’ve published this knowledge privately so only you (or authorized parties) can access it. If you’d like it public, just let me know."

- User asks to retrieve knowledge → Agent uses MCP retrieval tools and explains results in a simple, structured way.

- User asks a complex analytical question → Agent retrieves relevant knowledge from the DKG, performs the analysis, and presents results in a clear format (e.g., list, table, etc.).
`.trim();
