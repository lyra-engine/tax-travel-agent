import type { Client, Conversation, ChatMessage } from "./types";
import { uid } from "../storage";

const CLIENTS_KEY = "ttagent.advisor.clients.v1";
const CONVOS_KEY = "ttagent.advisor.convos.v1";
const ACTIVE_CLIENT_KEY = "ttagent.advisor.activeClient";
const ACTIVE_CONVO_KEY = "ttagent.advisor.activeConvo";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/* Clients ------------------------------------------------------------------ */

export function loadClients(): Client[] {
  return read<Client[]>(CLIENTS_KEY, []);
}

export function saveClients(clients: Client[]): void {
  write(CLIENTS_KEY, clients);
}

export function loadActiveClientId(): string | null {
  return read<string | null>(ACTIVE_CLIENT_KEY, null);
}

export function saveActiveClientId(id: string | null): void {
  write(ACTIVE_CLIENT_KEY, id);
}

export function createClient(partial: Partial<Client> & { name: string }): Client {
  const now = Date.now();
  return {
    id: uid(),
    name: partial.name,
    email: partial.email,
    filingStatus: partial.filingStatus ?? "single",
    dependents: partial.dependents,
    state: partial.state,
    residencyCountry: partial.residencyCountry ?? "US",
    income: partial.income,
    retirement: partial.retirement,
    age: partial.age,
    notes: partial.notes,
    tags: partial.tags,
    trips: partial.trips,
    createdAt: now,
    updatedAt: now,
  };
}

/* Conversations ------------------------------------------------------------ */

export function loadConversations(): Conversation[] {
  return read<Conversation[]>(CONVOS_KEY, []);
}

export function saveConversations(convos: Conversation[]): void {
  write(CONVOS_KEY, convos);
}

export function loadActiveConversationId(): string | null {
  return read<string | null>(ACTIVE_CONVO_KEY, null);
}

export function saveActiveConversationId(id: string | null): void {
  write(ACTIVE_CONVO_KEY, id);
}

export function newConversation(clientId?: string): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    clientId,
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const txt = firstUser.content.trim().replace(/\s+/g, " ");
  return txt.length > 64 ? txt.slice(0, 64) + "…" : txt;
}

/* Seed data ---------------------------------------------------------------- */

export function seedSampleClient(): Client {
  const now = Date.now();
  const year = new Date().getUTCFullYear();
  return {
    id: uid(),
    name: "Alex Nakamura",
    email: "alex@example.com",
    filingStatus: "mfj",
    dependents: 2,
    state: "NY",
    residencyCountry: "US",
    age: 42,
    income: {
      wages: 285_000,
      selfEmployment: 45_000,
      investment: 38_000,
    },
    retirement: {
      traditional401k: 12_000,
      rothIra: 0,
    },
    notes: "Plans to spend 4 months in Portugal next year. Considering Roth conversion ladder.",
    tags: ["high-earner", "cross-border"],
    trips: [
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${year}-01-01`, endDate: `${year}-05-10` },
      { id: uid(), jurisdictionCode: "PT", startDate: `${year}-05-15`, endDate: `${year}-09-10` },
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${year}-09-15`, endDate: `${year}-12-31` },
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` },
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${year - 2}-06-01`, endDate: `${year - 2}-12-31` },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
