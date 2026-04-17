import OpenAI from "openai";

/**
 * Provider-agnostic LLM client.
 *
 * Both OpenAI and Groq speak the OpenAI chat-completions wire format, so we
 * reuse the `openai` SDK for both. Groq wins when `GROQ_API_KEY` is set,
 * otherwise we fall back to OpenAI. This lets the same codebase run against
 * either provider without branching call-sites.
 */

export type Provider = "groq" | "openai" | "none";

export function activeProvider(): Provider {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export function getLLM(): OpenAI | null {
  const provider = activeProvider();
  if (provider === "groq") {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY!,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  if (provider === "openai") {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return null;
}

/** Default chat/tool-calling model. Override with LLM_MODEL. */
export function getModel(): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  const provider = activeProvider();
  if (provider === "groq") return "llama-3.3-70b-versatile";
  return "gpt-4o-mini";
}

/** Vision model for document intake. Override with LLM_VISION_MODEL. */
export function getVisionModel(): string {
  if (process.env.LLM_VISION_MODEL) return process.env.LLM_VISION_MODEL;
  const provider = activeProvider();
  if (provider === "groq") return "meta-llama/llama-4-scout-17b-16e-instruct";
  return "gpt-4o-mini";
}

/** Embedding model. Groq does not offer embeddings — callers should keyword-fallback. */
export function getEmbeddingModel(): string | null {
  if (activeProvider() === "openai") {
    return process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
  }
  return null;
}

/** Are embeddings available for RAG, or should we fall back to keyword search? */
export function supportsEmbeddings(): boolean {
  return activeProvider() === "openai";
}
