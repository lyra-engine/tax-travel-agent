import { KNOWLEDGE, searchKnowledge } from "./knowledge";
import type { Source } from "./types";
import { getLLM, getEmbeddingModel, supportsEmbeddings } from "./llm";

type IndexEntry = {
  id: string;
  title: string;
  url?: string;
  snippet: string;
  embedding: number[];
};

let indexPromise: Promise<IndexEntry[]> | null = null;
let usingSemantic = true;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function buildIndex(): Promise<IndexEntry[]> {
  if (!supportsEmbeddings()) {
    usingSemantic = false;
    return [];
  }
  const openai = getLLM();
  const model = getEmbeddingModel();
  if (!openai || !model) {
    usingSemantic = false;
    return [];
  }
  try {
    const inputs = KNOWLEDGE.map((d) => `${d.title}\n\n${d.snippet}`);
    const res = await openai.embeddings.create({ model, input: inputs });
    return KNOWLEDGE.map((d, i) => ({
      id: d.id,
      title: d.title,
      url: d.url,
      snippet: d.snippet,
      embedding: res.data[i]!.embedding as number[],
    }));
  } catch (err) {
    console.warn("[embeddings] failed to build index, falling back to keyword search:", err);
    usingSemantic = false;
    return [];
  }
}

function getIndex(): Promise<IndexEntry[]> {
  if (!indexPromise) {
    indexPromise = buildIndex();
  }
  return indexPromise;
}

async function embedQuery(query: string): Promise<number[] | null> {
  if (!supportsEmbeddings()) return null;
  const openai = getLLM();
  const model = getEmbeddingModel();
  if (!openai || !model) return null;
  try {
    const res = await openai.embeddings.create({ model, input: query });
    return (res.data[0]?.embedding as number[] | undefined) ?? null;
  } catch (err) {
    console.warn("[embeddings] query embed failed:", err);
    return null;
  }
}

export type SearchHit = Source & { score: number; method: "semantic" | "keyword" };

export async function semanticSearch(query: string, k = 4): Promise<SearchHit[]> {
  const index = await getIndex();
  if (!usingSemantic || index.length === 0) {
    return searchKnowledge(query, k).map((s) => ({ ...s, score: 0, method: "keyword" as const }));
  }
  const qEmb = await embedQuery(query);
  if (!qEmb) {
    return searchKnowledge(query, k).map((s) => ({ ...s, score: 0, method: "keyword" as const }));
  }
  const scored = index.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    snippet: entry.snippet,
    score: cosine(qEmb, entry.embedding),
    method: "semantic" as const,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function rebuildIndex(): void {
  indexPromise = null;
  usingSemantic = true;
}

export function isSemanticAvailable(): boolean {
  return usingSemantic;
}
