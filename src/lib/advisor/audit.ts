import { promises as fs } from "node:fs";
import path from "node:path";

// On Vercel/Lambda, the project filesystem is read-only. Fall back to /tmp
// (writable within a single invocation) so audit is best-effort without
// crashing. Locally we use ./data so the /audit page can replay history.
const AUDIT_DIR = process.env.VERCEL
  ? "/tmp/fidelis"
  : path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.log.jsonl");

export type AuditEntry = {
  id: string;
  ts: string;
  orgId?: string;
  orgName?: string;
  userId?: string;
  userEmail?: string;
  clientId?: string;
  clientName?: string;
  conversationLength: number;
  model: string;
  userMessage: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: Array<{ name: string; durationMs: number; error?: string }>;
  durationMs: number;
  finishReason: string;
  /** Rough USD cost estimate using the model's published rates. */
  estCostUsd: number;
  error?: string;
};

/** Approximate rates in $/1M tokens. Update when OpenAI prices change. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_PRICING[model] ?? MODEL_PRICING["gpt-4o-mini"]!;
  const cost = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return Math.round(cost * 100_000) / 100_000;
}

async function ensureDir() {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await ensureDir();
    await fs.appendFile(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.warn("[audit] failed to append entry:", err);
  }
}

export async function readAudit(limit = 200): Promise<AuditEntry[]> {
  try {
    await ensureDir();
    const raw = await fs.readFile(AUDIT_FILE, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const recent = lines.slice(-limit).reverse();
    const entries: AuditEntry[] = [];
    for (const l of recent) {
      try {
        entries.push(JSON.parse(l) as AuditEntry);
      } catch {
        /* skip malformed line */
      }
    }
    return entries;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ENOENT") return [];
    console.warn("[audit] read failed:", err);
    return [];
  }
}

export function summarize(entries: AuditEntry[]): {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  toolCallCount: number;
  errorCount: number;
} {
  const sum = {
    turns: entries.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    toolCallCount: 0,
    errorCount: 0,
  };
  for (const e of entries) {
    sum.inputTokens += e.inputTokens;
    sum.outputTokens += e.outputTokens;
    sum.totalTokens += e.totalTokens;
    sum.totalCostUsd += e.estCostUsd;
    sum.toolCallCount += e.toolCalls.length;
    if (e.error) sum.errorCount += 1;
  }
  sum.totalCostUsd = Math.round(sum.totalCostUsd * 10_000) / 10_000;
  return sum;
}
