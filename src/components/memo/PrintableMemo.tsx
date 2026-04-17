import { useEffect, useMemo, useState } from "react";
import type { Client, Conversation, ToolCall } from "../../lib/advisor/types";
import { FILING_STATUS_LABEL } from "../../lib/advisor/types";
import {
  loadClients,
  loadConversations,
} from "../../lib/advisor/store";

type Props = { conversationId: string };

export default function PrintableMemo({ conversationId }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    const convos = loadConversations();
    const c = convos.find((x) => x.id === conversationId) ?? null;
    setConvo(c);
    if (c?.clientId) {
      const clients = loadClients();
      setClient(clients.find((cl) => cl.id === c.clientId) ?? null);
    }
    setHydrated(true);
  }, [conversationId]);

  const allSources = useMemo(() => {
    if (!convo) return [];
    const seen = new Map<string, { id: string; title: string; url?: string; snippet: string; index: number }>();
    let idx = 1;
    for (const m of convo.messages) {
      if (m.sources) {
        for (const s of m.sources) {
          if (!seen.has(s.id)) {
            seen.set(s.id, { ...s, index: idx++ });
          }
        }
      }
    }
    return [...seen.values()];
  }, [convo]);

  const allToolCalls = useMemo(() => {
    if (!convo) return [];
    const list: Array<{ turn: number; tool: ToolCall }> = [];
    let turn = 0;
    for (const m of convo.messages) {
      if (m.role === "user") turn++;
      if (m.role === "assistant" && m.toolCalls) {
        for (const t of m.toolCalls) list.push({ turn, tool: t });
      }
    }
    return list;
  }, [convo]);

  if (!hydrated) {
    return <div className="p-10 text-center text-sm text-ink-400">Loading memo…</div>;
  }
  if (!convo) {
    return (
      <div className="p-10 text-center text-sm text-ink-400">
        Conversation not found. Open the agent, select the conversation, and try
        again.
      </div>
    );
  }

  const printedOn = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="memo-root">
      <div className="mx-auto max-w-[8.5in] px-6 py-8 print:p-0">
        <div className="no-print mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-ink-300">
            This is the printable version. Use your browser's{" "}
            <kbd className="rounded border border-white/10 px-1 font-mono text-xs">⌘P</kbd>{" "}
            (or Ctrl+P) and choose <b>Save as PDF</b>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-400"
            >
              Print / Save PDF
            </button>
            <a
              href="/agent"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/5 hover:text-white"
            >
              Back to chat
            </a>
          </div>
        </div>

        <div className="memo-page">
          <header className="memo-header">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="memo-logo">F</span>
                  <span className="text-[13px] font-semibold tracking-wide text-slate-900">
                    FIDELIS
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    Tax Planning Memo
                  </span>
                </div>
                <h1 className="mt-3 text-[22px] font-semibold leading-tight text-slate-900">
                  {convo.title}
                </h1>
                {client && (
                  <p className="mt-1 text-[12px] text-slate-600">
                    Prepared for{" "}
                    <span className="font-semibold text-slate-900">{client.name}</span>
                    {" · "}
                    {FILING_STATUS_LABEL[client.filingStatus]}
                    {client.state ? ` · ${client.state}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right text-[10px] uppercase tracking-wider text-slate-500">
                <div>Printed</div>
                <div className="mt-0.5 text-slate-700">{printedOn}</div>
                <div className="mt-2">Memo ID</div>
                <div className="mt-0.5 font-mono text-[10px] text-slate-600">
                  {convo.id.slice(0, 8)}
                </div>
              </div>
            </div>
            {client && <ClientFactSheet client={client} />}
          </header>

          <section className="memo-body">
            <h2 className="memo-h2">Discussion</h2>
            {convo.messages.map((m, idx) => (
              <div
                key={m.id}
                className={`memo-turn ${m.role === "user" ? "memo-turn--user" : "memo-turn--agent"}`}
              >
                <div className="memo-role">
                  {m.role === "user" ? "Advisor" : "Fidelis"}
                </div>
                <div className="memo-content">
                  <FormattedText text={m.content || "(no text)"} />
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="memo-toolrow">
                      <span className="memo-toolrow-label">Computations:</span>
                      {m.toolCalls.map((t) => (
                        <span key={t.id} className="memo-toolchip">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="memo-cite-row">
                      Cited:{" "}
                      {m.sources
                        .map((s) => allSources.find((x) => x.id === s.id)?.index ?? "?")
                        .map((n, i) => (
                          <sup key={i} className="memo-sup">
                            [{n}]
                          </sup>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>

          {allSources.length > 0 && (
            <section className="memo-body">
              <h2 className="memo-h2">Sources</h2>
              <ol className="memo-sources">
                {allSources.map((s) => (
                  <li key={s.id}>
                    <span className="memo-source-title">[{s.index}] {s.title}</span>
                    {s.url && (
                      <span className="memo-source-url"> — {s.url}</span>
                    )}
                    <div className="memo-source-snippet">{s.snippet}</div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {allToolCalls.length > 0 && (
            <section className="memo-body memo-appendix">
              <h2 className="memo-h2">Appendix: Computation log</h2>
              <p className="memo-muted">
                Every numerical claim in this memo was produced by a deterministic
                tool call. The raw arguments and outputs are included below for
                audit and reproducibility.
              </p>
              <ol className="memo-appendix-list">
                {allToolCalls.map((item, i) => (
                  <li key={i} className="memo-appendix-item">
                    <div className="memo-appendix-header">
                      <span className="memo-appendix-num">#{i + 1}</span>
                      <span className="memo-appendix-name">{item.tool.name}</span>
                      <span className="memo-appendix-turn">turn {item.turn}</span>
                    </div>
                    <div className="memo-appendix-subhead">Arguments</div>
                    <pre className="memo-pre">
                      {prettyJSON(item.tool.args)}
                    </pre>
                    <div className="memo-appendix-subhead">Result</div>
                    <pre className="memo-pre">
                      {item.tool.error
                        ? "Error: " + item.tool.error
                        : prettyJSON(item.tool.result)}
                    </pre>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <footer className="memo-footer">
            <p>
              <span className="font-semibold">Not tax or legal advice.</span>{" "}
              This memo was produced by Fidelis, an AI assistant, under the
              supervision of a licensed financial advisor. Figures and rules are
              informational only — verify against current IRS guidance before
              acting.
            </p>
          </footer>
        </div>
      </div>

      <style>{memoCSS}</style>
    </div>
  );
}

function ClientFactSheet({ client }: { client: Client }) {
  const rows: Array<[string, string | number | undefined]> = [
    ["Filing status", FILING_STATUS_LABEL[client.filingStatus]],
    ["State", client.state],
    ["Age", client.age],
    ["Dependents", client.dependents],
    ["Wages", fmt(client.income?.wages)],
    ["Self-employment", fmt(client.income?.selfEmployment)],
    ["Investment", fmt(client.income?.investment)],
    ["Rental", fmt(client.income?.rental)],
    ["Trad 401(k) YTD", fmt(client.retirement?.traditional401k)],
    ["Roth IRA YTD", fmt(client.retirement?.rothIra)],
  ];
  const tags = client.tags ?? [];
  return (
    <div className="memo-factsheet">
      <h3 className="memo-factsheet-title">Client snapshot</h3>
      <dl className="memo-factsheet-grid">
        {rows
          .filter((r) => r[1] != null && r[1] !== "")
          .map(([k, v]) => (
            <div key={k} className="memo-factsheet-row">
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
      {tags.length > 0 && (
        <div className="memo-factsheet-tags">
          {tags.map((t) => (
            <span key={t} className="memo-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {client.notes && <p className="memo-factsheet-notes">“{client.notes}”</p>}
    </div>
  );
}

function fmt(n?: number): string | undefined {
  if (n == null) return undefined;
  return "$" + Math.round(n).toLocaleString();
}

function prettyJSON(raw?: string): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/* -------------------------------------------------------------------------- */
/* tiny markdown formatter (same subset as chat)                              */
/* -------------------------------------------------------------------------- */

function FormattedText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          return (
            <h3 key={i} className="memo-h3">
              {inline(b.content)}
            </h3>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="memo-ul">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="memo-ol">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ol>
          );
        }
        if (b.type === "code") {
          return (
            <pre key={i} className="memo-pre">
              <code>{b.content}</code>
            </pre>
          );
        }
        return <p key={i} className="memo-p">{inline(b.content)}</p>;
      })}
    </>
  );
}

type Block =
  | { type: "p"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "list"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; content: string };

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        buf.push(lines[i]!);
        i++;
      }
      i++;
      out.push({ type: "code", content: buf.join("\n") });
      continue;
    }
    const h = /^(#{1,3})\s+(.+)/.exec(line);
    if (h) {
      out.push({ type: "heading", level: h[1]!.length, content: h[2]! });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push({ type: "list", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ type: "ol", items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    out.push({ type: "p", content: para.join(" ") });
  }
  return out;
}

function inline(s: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(s)) !== null) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={k++} className="memo-ic">{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

/* -------------------------------------------------------------------------- */
/* print-optimized CSS                                                         */
/* -------------------------------------------------------------------------- */

const memoCSS = `
.memo-root {
  background: #e5e7eb;
  min-height: 100vh;
  color: #0f172a;
}
.memo-page {
  background: white;
  color: #0f172a;
  padding: 0.65in 0.75in;
  border-radius: 2px;
  box-shadow: 0 20px 40px -20px rgba(0,0,0,0.4);
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  font-size: 11.5px;
  line-height: 1.55;
}
.memo-header { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
.memo-logo {
  display: inline-grid; place-items: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: linear-gradient(135deg,#3ec0ff,#34d399);
  color: #05070f; font-weight: 700; font-size: 12px;
}
.memo-factsheet {
  margin-top: 14px; padding: 10px 12px; border: 1px solid #e2e8f0;
  border-radius: 6px; background: #f8fafc;
}
.memo-factsheet-title {
  font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase;
  color: #475569; margin: 0 0 6px 0; font-weight: 600;
}
.memo-factsheet-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 4px 18px; margin: 0;
}
.memo-factsheet-row { display: flex; justify-content: space-between; font-size: 10.5px; }
.memo-factsheet-row dt { color: #64748b; }
.memo-factsheet-row dd { color: #0f172a; font-weight: 500; margin: 0; }
.memo-factsheet-tags { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.memo-tag {
  border: 1px solid #cbd5e1; color: #334155; background: white;
  border-radius: 999px; padding: 1px 8px; font-size: 9.5px;
}
.memo-factsheet-notes {
  margin: 8px 0 0 0; font-style: italic; color: #475569; font-size: 10.5px;
  border-top: 1px dashed #cbd5e1; padding-top: 6px;
}

.memo-body { margin-top: 18px; }
.memo-h2 {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;
  margin: 0 0 10px 0; font-weight: 700;
}
.memo-h3 {
  font-size: 12px; font-weight: 600; color: #0f172a;
  margin: 10px 0 4px 0;
}
.memo-p { margin: 0 0 6px 0; }
.memo-ul, .memo-ol { margin: 4px 0 6px 0; padding-left: 22px; }
.memo-ul li, .memo-ol li { margin: 1px 0; }
.memo-pre {
  margin: 4px 0 6px 0; padding: 8px 10px; background: #f1f5f9;
  border: 1px solid #e2e8f0; border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px; color: #0f172a; white-space: pre-wrap; word-break: break-word;
}
.memo-ic {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px;
  color: #0f172a;
}

.memo-turn {
  display: grid; grid-template-columns: 72px 1fr; gap: 14px;
  padding: 8px 0; border-top: 1px solid #f1f5f9;
}
.memo-turn:first-of-type { border-top: none; }
.memo-turn--user .memo-role { color: #0ea5e9; }
.memo-turn--agent .memo-role { color: #10b981; }
.memo-role {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 700;
}
.memo-content { min-width: 0; }
.memo-toolrow {
  margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  font-size: 9.5px; color: #475569;
}
.memo-toolrow-label { font-style: italic; }
.memo-toolchip {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #334155;
  border-radius: 4px; padding: 1px 6px; font-family: ui-monospace, monospace; font-size: 9.5px;
}
.memo-cite-row { margin-top: 4px; font-size: 9.5px; color: #64748b; }
.memo-sup { font-size: 9px; color: #0284c7; margin-left: 2px; }

.memo-sources { margin: 0; padding-left: 22px; }
.memo-sources li { margin: 0 0 8px 0; font-size: 10.5px; }
.memo-source-title { font-weight: 600; color: #0f172a; }
.memo-source-url {
  color: #0369a1; font-family: ui-monospace, monospace; font-size: 9.5px;
  word-break: break-all;
}
.memo-source-snippet { margin-top: 2px; color: #475569; font-size: 10px; }

.memo-appendix { margin-top: 22px; }
.memo-muted { color: #64748b; font-size: 10.5px; }
.memo-appendix-list { list-style: none; padding: 0; margin: 12px 0 0 0; }
.memo-appendix-item {
  margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 10px; background: #fafbfc;
}
.memo-appendix-header {
  display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px;
}
.memo-appendix-num {
  font-family: ui-monospace, monospace; color: #64748b; font-size: 10px;
}
.memo-appendix-name {
  font-family: ui-monospace, monospace; color: #0f172a; font-weight: 600; font-size: 11px;
}
.memo-appendix-turn {
  margin-left: auto; font-size: 9.5px; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.1em;
}
.memo-appendix-subhead {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em;
  color: #64748b; margin-top: 4px; font-weight: 600;
}

.memo-footer {
  margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0;
  font-size: 9.5px; color: #64748b;
}

/* Print rules */
@media print {
  .no-print { display: none !important; }
  .memo-root { background: white; }
  .memo-page { box-shadow: none; border-radius: 0; padding: 0; font-size: 10.5px; }
  @page { size: letter; margin: 0.65in 0.75in; }
  .memo-turn { page-break-inside: avoid; }
  .memo-appendix-item { page-break-inside: avoid; }
  .memo-sources li { page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;
