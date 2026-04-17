import type { Trip } from "../types";

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qw";

export type Client = {
  id: string;
  name: string;
  email?: string;
  filingStatus: FilingStatus;
  dependents?: number;
  state?: string;
  residencyCountry?: string;
  income?: {
    wages?: number;
    selfEmployment?: number;
    investment?: number;
    rental?: number;
    other?: number;
  };
  retirement?: {
    traditional401k?: number;
    roth401k?: number;
    traditionalIra?: number;
    rothIra?: number;
  };
  age?: number;
  notes?: string;
  tags?: string[];
  trips?: Trip[];
  createdAt: number;
  updatedAt: number;
};

export type ChatRole = "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  args: string;
  result?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

export type Source = {
  id: string;
  title: string;
  url?: string;
  snippet: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
};

export type DraftEmail = {
  subject: string;
  body: string;
  tone: "formal" | "friendly" | "concise";
  to?: string;
  cc?: string[];
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  sources?: Source[];
  usage?: Usage;
  drafts?: DraftEmail[];
  createdAt: number;
};

export type Conversation = {
  id: string;
  clientId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
  qw: "Qualifying widow(er)",
};
