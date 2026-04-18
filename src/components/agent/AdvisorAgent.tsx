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
import { copyWorkspaceJournalToClient, workspaceJournalTripCount } from "../../lib/advisor/tracker-sync";
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
  const [syncFlash, setSyncFlash] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<Array<{ id: string; note: string; tags?: string[] }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [editingClientId, setEditingClientId] = useState<string | null>(null);

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

  useEffect(() => { if (hydrated) saveClients(clients); }, [clients, hydrated]);
  useEffect(() => { if (hydrated) saveConversations(conversations); }, [conversations, hydrated]);
  useEffect(() => { if (hydrated) saveActiveClientId(activeClientId); }, [activeClientId, hydrated]);
  useEffect(() => { if (hydrated) saveActiveConversationId(activeConvoId); }, [activeConvoId, hydrated]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? undefined,
    [clients, activeClientId],
  );
  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeConvoId) ?? undefined,
    [conversations, activeConvoId],
  );

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

  const syncJournalFromTracker = useCallback(() => {
    if (!activeClient) return;
    const fromN = workspaceJournalTripCount();
    const existingN = activeClient.trips?.length ?? 0;
    if (existingN > 0) {
      const ok = confirm(
        `Replace ${existingN} trip(s) on ${activeClient.name} with ${fromN} from the residency journal?`,
      );
      if (!ok) return;
    }
    const r = copyWorkspaceJournalToClient(activeClient.id);
    if (!r.ok) {
      alert(r.message);
      return;
    }
    setClients(loadClients());
    setSyncFlash(`Copied ${r.tripCount} trip(s) from /tracker → ${r.clientName}.`);
    window.setTimeout(() => setSyncFlash(null), 5000);
  }, [activeClient]);

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
    return (
      <div className="flex items-center gap-3 text-sm text-ink-400">
        <span className="label-xs">Loading workspace</span>
        <span className="inline-block h-1 w-20 overflow-hidden bg-white/5">
          <span className="block h-full w-1/3 animate-pulse bg-white/30" />
        </span>
      </div>
    );
  }

  const editingClient = editingClientId
    ? clients.find((c) => c.id === editingClientId) ?? undefined
    : undefined;
  const creatingClient = editingClientId === "__new__";

  return (
    <div className="grid gap-0 overflow-hidden border border-white/[0.06] bg-black/20 lg:grid-cols-[280px_1fr]">
      {/* ---------- Sidebar ---------- */}
      <aside className="flex min-h-[72vh] flex-col gap-0 border-b border-white/[0.06] lg:border-b-0 lg:border-r">
        {/* Mode switcher */}
        <div className="flex items-center gap-0 border-b border-white/[0.06]">
          <button
            onClick={() => setMode("chat")}
            className={`flex-1 py-3 font-mono text-[10.5px] uppercase tracking-[0.22em] transition ${
              mode === "chat"
                ? "text-white"
                : "text-ink-500 hover:text-ink-200"
            }`}
          >
            Chat
            {mode === "chat" && (
              <span className="mt-2 block h-px w-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            )}
          </button>
          <div className="h-8 w-px bg-white/[0.06]" />
          <button
            onClick={() => setMode("clients")}
            className={`flex-1 py-3 font-mono text-[10.5px] uppercase tracking-[0.22em] transition ${
              mode === "clients"
                ? "text-white"
                : "text-ink-500 hover:text-ink-200"
            }`}
          >
            Clients · {clients.length}
            {mode === "clients" && (
              <span className="mt-2 block h-px w-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            )}
          </button>
        </div>

        {/* New button */}
        <div className="p-4">
          <button
            onClick={mode === "chat" ? startNewConversation : () => setEditingClientId("__new__")}
            disabled={streaming && mode === "chat"}
            className="btn-ghost w-full"
          >
            <span className="text-ink-400">+</span>
            {mode === "chat" ? "New conversation" : "New client"}
          </button>
        </div>

        <div className="hairline-x opacity-60" />

        {/* List */}
        <div className="flex-1 overflow-y-auto">
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
            <div className="flex flex-col">
              {clients.length === 0 && (
                <p className="px-5 py-6 text-xs text-ink-500">No clients yet.</p>
              )}
              {clients.map((c) => (
                <div
                  key={c.id}
                  className={`hairline-row group flex items-center gap-3 px-5 py-3 ${
                    activeClientId === c.id ? "is-active" : ""
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                    onClick={() => setActiveClientId(c.id)}
                  >
                    <span className="truncate font-display text-[15px] font-light tracking-tight text-white">
                      {c.name}
                    </span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-ink-500">
                      {c.state ?? "—"} · {c.filingStatus.toUpperCase()}
                    </span>
                  </button>
                  <button
                    onClick={() => setEditingClientId(c.id)}
                    className="p-1 text-ink-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                    aria-label="Edit client"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeClient(c.id)}
                    className="p-1 text-ink-500 opacity-0 transition hover:text-danger-400 group-hover:opacity-100"
                    aria-label="Delete client"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ---------- Main pane ---------- */}
      <main className="flex min-h-[72vh] flex-col">
        {mode === "clients" ? (
          <ClientEditor
            key={editingClientId ?? "list"}
            initial={creatingClient ? undefined : editingClient}
            onSave={upsertClient}
            onCancel={() => setEditingClientId(null)}
          />
        ) : (
          <div className="flex min-h-[72vh] flex-1 flex-col overflow-hidden">
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
              onSyncJournal={syncJournalFromTracker}
              onOpenMemo={
                activeConvo && activeConvo.messages.length > 0
                  ? () => window.open(`/memo/${activeConvo.id}`, "_blank")
                  : undefined
              }
              canExport={!!activeConvo && activeConvo.messages.length > 0}
            />
            {syncFlash && (
              <p className="border-b border-white/[0.04] bg-brand-500/[0.06] px-6 py-2 text-xs text-brand-200">
                {syncFlash}
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              {(!activeConvo || activeConvo.messages.length === 0) ? (
                <EmptyState
                  suggestions={SUGGESTED_PROMPTS}
                  onPick={send}
                  clientName={activeClient?.name}
                />
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10 sm:px-10">
                  {activeConvo.messages.map((m) => (
                    <MessageView key={m.id} message={m} streaming={streaming} />
                  ))}
                </div>
              )}
            </div>

            {pendingNotes.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-warn-500/25 bg-warn-500/[0.04] px-6 py-4">
                <span className="label-xs text-warn-400">
                  Notes ready to attach · {activeClient?.name ?? "client"}
                </span>
                {pendingNotes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start justify-between gap-4 border-l-2 border-warn-500/40 pl-3"
                  >
                    <p className="flex-1 text-sm leading-relaxed text-ink-100">{n.note}</p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => acceptNote(n.id)}
                        className="btn-link text-accent-400 hover:text-accent-300"
                      >
                        Attach ↵
                      </button>
                      <button
                        onClick={() => dismissNote(n.id)}
                        className="btn-link"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {streamError && (
              <div className="border-t border-danger-500/30 bg-danger-500/[0.05] px-6 py-3">
                <span className="label-xs text-danger-400">Error</span>
                <p className="mt-1 text-sm text-danger-300">{streamError}</p>
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
                  : "Pick a client, or ask a general tax question…"
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
    <div className="mx-auto flex h-full max-w-2xl flex-col items-start justify-center gap-10 px-8 py-20">
      <div className="flex flex-col gap-4">
        <span className="kicker">Begin</span>
        <h3 className="font-display text-[2rem] font-light leading-[1.05] tracking-tight text-white">
          {clientName
            ? <>What shall we examine for <em className="italic text-brand-300/90">{clientName}</em>?</>
            : <>What shall we <em className="italic text-brand-300/90">examine</em>?</>
          }
        </h3>
        <p className="max-w-lg text-sm leading-relaxed text-ink-400">
          Tool-computed math. Cited rules. Federal brackets, residency
          day-counts, contribution limits, Roth conversion ladders, NIIT,
          AMT — and a growing knowledge base behind every answer.
        </p>
      </div>

      <div className="w-full">
        <div className="label-xs mb-3">Starting points</div>
        <div className="flex flex-col">
          {suggestions.map((s, i) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="hairline-row group flex items-center gap-4 px-0 py-3 text-left transition"
            >
              <span className="font-mono text-[10px] tracking-[0.22em] text-ink-500 group-hover:text-brand-300">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm leading-relaxed text-ink-200 transition group-hover:text-white">
                {s}
              </span>
              <span className="font-mono text-[10px] tracking-[0.22em] text-ink-500 opacity-0 transition group-hover:opacity-100">
                →
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
