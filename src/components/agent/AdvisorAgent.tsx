import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Client, Conversation, DraftEmail, Source, ToolCall, Usage } from "../../lib/advisor/types";
import {
  deriveTitle,
  loadActiveClientId,
  loadActiveConversationId,
  loadClients,
  loadConversations,
  newConversation,
  saveActiveClientId,
  saveActiveConversationId,
  saveClients,
  saveConversations,
  seedSampleClient,
} from "../../lib/advisor/store";
import { uid } from "../../lib/storage";
import { SUGGESTED_PROMPTS } from "../../lib/advisor/agent";
import ConversationList from "./ConversationList";
import ClientHeader from "./ClientHeader";
import MessageView from "./MessageView";
import Composer from "./Composer";
import ClientEditor from "./ClientEditor";

type Mode = "chat" | "clients";

export default function AdvisorAgent() {
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");

  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<Array<{ id: string; note: string; tags?: string[] }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  // ---------- hydrate from localStorage ----------
  useEffect(() => {
    let cs = loadClients();
    if (cs.length === 0) {
      const sample = seedSampleClient();
      cs = [sample];
      saveClients(cs);
      saveActiveClientId(sample.id);
    }
    const convos = loadConversations();
    setClients(cs);
    setConversations(convos);
    setActiveClientId(loadActiveClientId() ?? cs[0]?.id ?? null);
    setActiveConvoId(loadActiveConversationId());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveClients(clients);
  }, [clients, hydrated]);
  useEffect(() => {
    if (hydrated) saveConversations(conversations);
  }, [conversations, hydrated]);
  useEffect(() => {
    if (hydrated) saveActiveClientId(activeClientId);
  }, [activeClientId, hydrated]);
  useEffect(() => {
    if (hydrated) saveActiveConversationId(activeConvoId);
  }, [activeConvoId, hydrated]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? undefined,
    [clients, activeClientId],
  );
  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeConvoId) ?? undefined,
    [conversations, activeConvoId],
  );

  // ---------- conversation helpers ----------
  const ensureConversation = useCallback((): Conversation => {
    if (activeConvo) return activeConvo;
    const fresh = newConversation(activeClientId ?? undefined);
    setConversations((list) => [fresh, ...list]);
    setActiveConvoId(fresh.id);
    return fresh;
  }, [activeConvo, activeClientId]);

  const updateConversation = useCallback(
    (id: string, updater: (c: Conversation) => Conversation) => {
      setConversations((list) =>
        list.map((c) => (c.id === id ? { ...updater(c), updatedAt: Date.now() } : c)),
      );
    },
    [],
  );

  const startNewConversation = () => {
    if (streaming) return;
    const fresh = newConversation(activeClientId ?? undefined);
    setConversations((list) => [fresh, ...list]);
    setActiveConvoId(fresh.id);
    setPendingNotes([]);
    setStreamError(null);
    setMode("chat");
  };

  const deleteConversation = (id: string) => {
    setConversations((list) => list.filter((c) => c.id !== id));
    if (activeConvoId === id) setActiveConvoId(null);
  };

  // ---------- send a message + stream response ----------
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setStreamError(null);

      const convo = ensureConversation();
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      const asstId = uid();
      const assistantMsg: ChatMessage = {
        id: asstId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        toolCalls: [],
        sources: [],
      };

      updateConversation(convo.id, (c) => ({
        ...c,
        title: c.messages.length === 0 ? deriveTitle([userMsg]) : c.title,
        messages: [...c.messages, userMsg, assistantMsg],
      }));

      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const transcriptForServer = [...convo.messages, userMsg]
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: transcriptForServer,
            client: activeClient,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Server returned ${res.status}`);
        }
        if (!res.body) throw new Error("No response body from server.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const applyEvent = (ev: StreamEvent) => {
          updateConversation(convo.id, (c) => {
            const msgs = c.messages.map((m) => {
              if (m.id !== asstId) return m;
              switch (ev.type) {
                case "token":
                  return { ...m, content: (m.content ?? "") + ev.text };
                case "tool_start": {
                  const tc: ToolCall = {
                    id: ev.id,
                    name: ev.name,
                    args: "",
                    startedAt: Date.now(),
                  };
                  return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
                }
                case "tool_args": {
                  const toolCalls = (m.toolCalls ?? []).map((t) =>
                    t.id === ev.id ? { ...t, args: t.args + ev.args } : t,
                  );
                  return { ...m, toolCalls };
                }
                case "tool_result": {
                  const toolCalls = (m.toolCalls ?? []).map((t) =>
                    t.id === ev.id
                      ? { ...t, result: ev.result, error: ev.error, finishedAt: Date.now() }
                      : t,
                  );
                  return { ...m, toolCalls };
                }
                case "source": {
                  const have = m.sources?.some((s) => s.id === ev.source.id);
                  if (have) return m;
                  return { ...m, sources: [...(m.sources ?? []), ev.source] };
                }
                case "usage": {
                  const usage: Usage = {
                    inputTokens: ev.inputTokens,
                    outputTokens: ev.outputTokens,
                    totalTokens: ev.totalTokens,
                    costUsd: ev.costUsd,
                    model: ev.model,
                    durationMs: ev.durationMs,
                  };
                  return { ...m, usage };
                }
                case "pending_email": {
                  const draft: DraftEmail = {
                    subject: ev.draft.subject,
                    body: ev.draft.body,
                    tone: ev.draft.tone,
                    to: ev.draft.to,
                    cc: ev.draft.cc,
                  };
                  return { ...m, drafts: [...(m.drafts ?? []), draft] };
                }
                default:
                  return m;
              }
            });
            return { ...c, messages: msgs };
          });

          if (ev.type === "pending_note") {
            setPendingNotes((ns) => [...ns, { id: uid(), note: ev.note, tags: ev.tags }]);
          }
          if (ev.type === "error") {
            setStreamError(ev.message);
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as StreamEvent;
              applyEvent(ev);
            } catch (err) {
              console.warn("Failed to parse stream line", err, line);
            }
          }
        }
        if (buffer.trim()) {
          try {
            applyEvent(JSON.parse(buffer) as StreamEvent);
          } catch {
            /* ignore trailing partial */
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          setStreamError("Cancelled.");
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setStreamError(msg);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, ensureConversation, updateConversation, activeClient],
  );

  const cancelStream = () => {
    abortRef.current?.abort();
  };

  // ---------- pending note helpers ----------
  const acceptNote = (id: string) => {
    const pn = pendingNotes.find((n) => n.id === id);
    if (!pn || !activeClient) return;
    setClients((list) =>
      list.map((c) =>
        c.id === activeClient.id
          ? {
              ...c,
              notes: [c.notes, `• ${pn.note}`].filter(Boolean).join("\n"),
              tags: Array.from(new Set([...(c.tags ?? []), ...(pn.tags ?? [])])),
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
    setPendingNotes((ns) => ns.filter((n) => n.id !== id));
  };
  const dismissNote = (id: string) =>
    setPendingNotes((ns) => ns.filter((n) => n.id !== id));

  // ---------- clients CRUD ----------
  const upsertClient = (c: Client) => {
    setClients((list) => {
      const exists = list.some((x) => x.id === c.id);
      return exists ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
    });
    if (!activeClientId) setActiveClientId(c.id);
    setEditingClientId(null);
  };
  const removeClient = (id: string) => {
    if (!confirm("Delete this client? Their conversations will remain but lose the link.")) return;
    setClients((list) => list.filter((c) => c.id !== id));
    if (activeClientId === id) setActiveClientId(null);
  };

  const clientConvos = useMemo(
    () =>
      conversations
        .filter((c) => !activeClientId || c.clientId === activeClientId || c.clientId == null)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations, activeClientId],
  );

  const exportMarkdown = () => {
    if (!activeConvo) return;
    const lines: string[] = [];
    lines.push(`# ${activeConvo.title}`);
    if (activeClient) lines.push(`**Client:** ${activeClient.name}`);
    lines.push(`**Date:** ${new Date(activeConvo.updatedAt).toISOString().slice(0, 10)}`);
    lines.push("");
    for (const m of activeConvo.messages) {
      lines.push(`## ${m.role === "user" ? "Advisor" : "Fidelis"}`);
      lines.push(m.content || "_(no text)_");
      if (m.toolCalls && m.toolCalls.length > 0) {
        lines.push("");
        lines.push("_Tool calls:_");
        for (const t of m.toolCalls) {
          lines.push(`- \`${t.name}(${t.args})\``);
        }
      }
      if (m.sources && m.sources.length > 0) {
        lines.push("");
        lines.push("_Sources:_");
        for (const s of m.sources) {
          lines.push(`- [${s.title}](${s.url ?? "#"})`);
        }
      }
      lines.push("");
    }
    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeClient?.name ?? "memo").replace(/\W+/g, "-")}-${activeConvo.title.replace(/\W+/g, "-").slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hydrated) {
    return <div className="card p-8 text-center text-ink-400">Loading workspace…</div>;
  }

  const editingClient = editingClientId
    ? clients.find((c) => c.id === editingClientId) ?? undefined
    : undefined;
  const creatingClient = editingClientId === "__new__";

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* -------- Sidebar -------- */}
      <aside className="flex flex-col gap-3">
        <div className="card flex flex-col gap-2 p-3">
          <div className="flex gap-1 rounded-lg bg-ink-900/60 p-1">
            <button
              onClick={() => setMode("chat")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mode === "chat" ? "bg-white/10 text-white" : "text-ink-400 hover:text-white"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setMode("clients")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mode === "clients" ? "bg-white/10 text-white" : "text-ink-400 hover:text-white"
              }`}
            >
              Clients ({clients.length})
            </button>
          </div>
          <button
            onClick={startNewConversation}
            disabled={streaming}
            className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 disabled:opacity-50"
          >
            + New conversation
          </button>
        </div>

        {mode === "chat" ? (
          <ConversationList
            conversations={clientConvos}
            activeId={activeConvoId}
            clients={clients}
            onSelect={(id) => {
              setActiveConvoId(id);
              setPendingNotes([]);
              setStreamError(null);
            }}
            onDelete={deleteConversation}
          />
        ) : (
          <div className="card flex flex-col gap-1 p-2">
            <button
              onClick={() => setEditingClientId("__new__")}
              className="mb-1 rounded-md px-2 py-2 text-sm font-medium text-brand-300 hover:bg-white/5"
            >
              + Add client
            </button>
            {clients.length === 0 && (
              <p className="px-2 py-3 text-xs text-ink-500">No clients yet.</p>
            )}
            {clients.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  activeClientId === c.id ? "bg-brand-500/10" : "hover:bg-white/5"
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  onClick={() => setActiveClientId(c.id)}
                >
                  <span className="truncate text-sm text-white">{c.name}</span>
                  <span className="truncate text-xs text-ink-500">
                    {c.state ?? "—"} · {c.filingStatus.toUpperCase()}
                  </span>
                </button>
                <button
                  onClick={() => setEditingClientId(c.id)}
                  className="rounded p-1 text-ink-500 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  aria-label="Edit client"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={() => removeClient(c.id)}
                  className="rounded p-1 text-ink-500 opacity-0 hover:bg-danger-500/15 hover:text-danger-400 group-hover:opacity-100"
                  aria-label="Delete client"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* -------- Main pane -------- */}
      <main className="flex min-h-[70vh] flex-col">
        {mode === "clients" ? (
          <ClientEditor
            key={editingClientId ?? "list"}
            initial={creatingClient ? undefined : editingClient}
            onSave={upsertClient}
            onCancel={() => setEditingClientId(null)}
          />
        ) : (
          <div className="card flex min-h-[70vh] flex-1 flex-col overflow-hidden">
            <ClientHeader
              clients={clients}
              activeClient={activeClient}
              onSelect={(id) => setActiveClientId(id)}
              onEdit={() => {
                if (activeClient) {
                  setMode("clients");
                  setEditingClientId(activeClient.id);
                }
              }}
              onExport={exportMarkdown}
              onOpenMemo={
                activeConvo && activeConvo.messages.length > 0
                  ? () => window.open(`/memo/${activeConvo.id}`, "_blank")
                  : undefined
              }
              canExport={!!activeConvo && activeConvo.messages.length > 0}
            />

            <div className="flex-1 overflow-y-auto">
              {(!activeConvo || activeConvo.messages.length === 0) ? (
                <EmptyState
                  suggestions={SUGGESTED_PROMPTS}
                  onPick={send}
                  clientName={activeClient?.name}
                />
              ) : (
                <div className="flex flex-col gap-6 px-5 py-6 sm:px-8">
                  {activeConvo.messages.map((m) => (
                    <MessageView key={m.id} message={m} streaming={streaming} />
                  ))}
                </div>
              )}
            </div>

            {pendingNotes.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/5 bg-warn-500/5 px-5 py-3">
                <p className="text-xs font-medium text-warn-400">
                  Notes ready to attach to {activeClient?.name ?? "client"}
                </p>
                {pendingNotes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-warn-500/30 bg-warn-500/5 px-3 py-2"
                  >
                    <p className="flex-1 text-sm text-ink-100">{n.note}</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => acceptNote(n.id)}
                        className="rounded-md bg-accent-500/20 px-2 py-1 text-xs font-medium text-accent-400 hover:bg-accent-500/30"
                      >
                        Attach
                      </button>
                      <button
                        onClick={() => dismissNote(n.id)}
                        className="rounded-md px-2 py-1 text-xs text-ink-400 hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {streamError && (
              <div className="border-t border-danger-500/30 bg-danger-500/10 px-5 py-3 text-sm text-danger-300">
                {streamError}
              </div>
            )}

            <Composer
              disabled={!hydrated}
              streaming={streaming}
              onSubmit={send}
              onCancel={cancelStream}
              placeholder={
                activeClient
                  ? `Ask Fidelis about ${activeClient.name}…`
                  : "Pick a client from the sidebar, or ask a general tax question…"
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}

type StreamEvent =
  | { type: "start"; id: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_args"; id: string; args: string }
  | { type: "tool_result"; id: string; name: string; result: string; error?: string }
  | { type: "source"; source: Source }
  | { type: "pending_note"; note: string; tags?: string[] }
  | {
      type: "pending_email";
      draft: {
        subject: string;
        body: string;
        tone: "formal" | "friendly" | "concise";
        to?: string;
        cc?: string[];
      };
    }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      model: string;
      durationMs: number;
    }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

function EmptyState({
  suggestions,
  onPick,
  clientName,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  clientName?: string;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-accent-500 text-ink-950 shadow-xl shadow-brand-500/30">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5" />
          <path d="m2 12 10 5 10-5" />
        </svg>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white">
          {clientName ? `What can I help you with on ${clientName}?` : "What can I help you dig into?"}
        </h3>
        <p className="mt-2 text-sm text-ink-400">
          Fidelis has tools for federal bracket math, residency day-counts, contribution limits,
          and a built-in tax knowledge base. Every number is tool-computed; every rule is cited.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-ink-100 transition hover:border-brand-500/40 hover:bg-brand-500/5"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
