import { useMemo, useState } from "react";
import type { ChatMessage, DraftEmail, ToolCall } from "../../lib/advisor/types";

type Props = {
  message: ChatMessage;
  streaming: boolean;
};

export default function MessageView({ message, streaming }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-500/15 px-4 py-2.5 text-sm text-ink-50 ring-1 ring-brand-500/30">
          <FormattedText text={message.content} />
        </div>
      </div>
    );
  }

  const isEmpty = !message.content && (message.toolCalls?.length ?? 0) === 0;
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-accent-500 text-ink-950 shadow-lg shadow-brand-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5" />
          <path d="m2 12 10 5 10-5" />
        </svg>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((t) => (
              <ToolCallView key={t.id} tool={t} />
            ))}
          </div>
        )}

        {message.content && (
          <div className="prose prose-invert prose-sm max-w-none text-ink-100 prose-headings:text-white prose-strong:text-white prose-a:text-brand-300">
            <FormattedText text={message.content} />
          </div>
        )}

        {isEmpty && streaming && <ThinkingIndicator />}

        {message.drafts && message.drafts.length > 0 && (
          <div className="space-y-2">
            {message.drafts.map((d, i) => (
              <EmailDraftCard key={i} draft={d} />
            ))}
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}

        {message.usage && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-ink-500">
            <UsageChip label={message.usage.model} />
            <UsageChip
              label={`${message.usage.inputTokens.toLocaleString()} in + ${message.usage.outputTokens.toLocaleString()} out`}
            />
            <UsageChip label={`${(message.usage.durationMs / 1000).toFixed(1)}s`} />
            <UsageChip label={`$${message.usage.costUsd.toFixed(5)}`} tone="brand" />
          </div>
        )}
      </div>
    </div>
  );
}

function UsageChip({ label, tone = "ink" }: { label: string; tone?: "ink" | "brand" }) {
  const cls =
    tone === "brand"
      ? "bg-brand-500/10 text-brand-300 border-brand-500/20"
      : "bg-white/[0.03] text-ink-400 border-white/10";
  return (
    <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>
      {label}
    </span>
  );
}

function ToolCallView({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const running = !tool.finishedAt;
  const hasError = !!tool.error;

  const parsedResult = useMemo(() => {
    if (!tool.result) return null;
    try {
      return JSON.stringify(JSON.parse(tool.result), null, 2);
    } catch {
      return tool.result;
    }
  }, [tool.result]);

  const parsedArgs = useMemo(() => {
    if (!tool.args) return null;
    try {
      return JSON.stringify(JSON.parse(tool.args), null, 2);
    } catch {
      return tool.args;
    }
  }, [tool.args]);

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs transition ${
        hasError
          ? "border-danger-500/30 bg-danger-500/5"
          : running
            ? "border-brand-500/30 bg-brand-500/5"
            : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2"
      >
        {running ? (
          <Spinner className="h-3 w-3 text-brand-400" />
        ) : hasError ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-danger-400">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="m12 16 .01 0" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-accent-400">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        <span className="font-mono text-ink-200">
          <span className="text-ink-400">fn</span> {tool.name}
        </span>
        <span className="ml-auto text-ink-500">
          {running ? "running…" : hasError ? "error" : "ok"}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-white/5 pt-2">
          {parsedArgs && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">Arguments</p>
              <pre className="mt-1 overflow-x-auto rounded bg-ink-950/60 p-2 font-mono text-[11px] text-ink-200">
                {parsedArgs}
              </pre>
            </div>
          )}
          {(parsedResult || tool.error) && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                {tool.error ? "Error" : "Result"}
              </p>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-ink-950/60 p-2 font-mono text-[11px] text-ink-200">
                {tool.error ?? parsedResult}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourcesPanel({ sources }: { sources: ChatMessage["sources"] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
        Sources ({sources.length})
      </p>
      <div className="mt-2 space-y-1.5">
        {sources.map((s, i) => (
          <div key={s.id} className="flex gap-2 text-xs">
            <span className="mt-0.5 shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 font-mono text-[10px] text-brand-300">
              [{i + 1}]
            </span>
            <div className="min-w-0">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-ink-100 hover:text-brand-300 hover:underline"
                >
                  {s.title}
                </a>
              ) : (
                <span className="font-medium text-ink-100">{s.title}</span>
              )}
              <p className="mt-0.5 line-clamp-2 text-ink-400">{s.snippet}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-400">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" />
      </span>
      <span>Thinking…</span>
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Ultra-light markdown-lite: paragraphs, bullets, inline code, bold, italics,
 * headings. Intentionally small — no external deps.
 */
function FormattedText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const H = b.level === 1 ? "h2" : b.level === 2 ? "h3" : "h4";
          return (
            <H key={i} className="mt-3 text-sm font-semibold text-white first:mt-0">
              {inline(b.content)}
            </H>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="my-2 list-decimal space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ol>
          );
        }
        if (b.type === "code") {
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded-lg bg-ink-950/60 p-3 font-mono text-[12px] text-ink-100"
            >
              <code>{b.content}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="my-2 leading-relaxed first:mt-0">
            {inline(b.content)}
          </p>
        );
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
    const heading = /^(#{1,3})\s+(.+)/.exec(line);
    if (heading) {
      out.push({ type: "heading", level: heading[1]!.length, content: heading[2]! });
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
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    out.push({ type: "p", content: paraLines.join(" ") });
  }
  return out;
}

function inline(s: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(s)) !== null) {
    if (match.index > lastIndex) nodes.push(s.slice(lastIndex, match.index));
    const tok = match[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-ink-900 px-1 py-0.5 font-mono text-[12px] text-brand-300"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    lastIndex = match.index + tok.length;
  }
  if (lastIndex < s.length) nodes.push(s.slice(lastIndex));
  return nodes;
}

/* -------------------------------------------------------------------------- */
/* Email draft review card                                                    */
/* -------------------------------------------------------------------------- */

function EmailDraftCard({ draft }: { draft: DraftEmail }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [to, setTo] = useState(draft.to ?? "");
  const [copied, setCopied] = useState<"subject" | "body" | "all" | null>(null);

  const mailto = useMemo(() => {
    const qp = new URLSearchParams();
    qp.set("subject", subject);
    qp.set("body", body);
    if (draft.cc?.length) qp.set("cc", draft.cc.join(","));
    return `mailto:${encodeURIComponent(to)}?${qp.toString()}`;
  }, [subject, body, to, draft.cc]);

  const copy = async (which: "subject" | "body" | "all") => {
    const text =
      which === "subject" ? subject : which === "body" ? body : `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-accent-500/30 bg-accent-500/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-500/15 text-accent-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-300">
              Draft email · advisor review required
            </p>
            <p className="text-[11px] text-ink-500">
              Tone: {draft.tone} · Edit inline, then copy or open in your mail
              client.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-warn-500/30 bg-warn-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warn-300">
          Unsent
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <label className="flex items-baseline gap-3">
          <span className="w-14 shrink-0 text-[11px] uppercase tracking-wider text-ink-500">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
            className="flex-1 rounded-md border border-white/10 bg-ink-900/60 px-2 py-1 text-sm text-white outline-none focus:border-accent-500"
          />
        </label>
        <label className="flex items-baseline gap-3">
          <span className="w-14 shrink-0 text-[11px] uppercase tracking-wider text-ink-500">
            Subject
          </span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 rounded-md border border-white/10 bg-ink-900/60 px-2 py-1 text-sm text-white outline-none focus:border-accent-500"
          />
        </label>
        <div className="rounded-md border border-white/10 bg-ink-900/60">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={Math.min(16, Math.max(6, body.split("\n").length + 1))}
            className="w-full resize-y bg-transparent p-3 text-sm leading-relaxed text-ink-100 outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={mailto}
          className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400"
        >
          Open in mail client →
        </a>
        <button
          onClick={() => copy("all")}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-ink-200 hover:bg-white/10"
        >
          {copied === "all" ? "Copied!" : "Copy all"}
        </button>
        <button
          onClick={() => copy("body")}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-ink-200 hover:bg-white/10"
        >
          {copied === "body" ? "Copied!" : "Copy body"}
        </button>
        <button
          onClick={() => copy("subject")}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-ink-200 hover:bg-white/10"
        >
          {copied === "subject" ? "Copied!" : "Copy subject"}
        </button>
      </div>
    </div>
  );
}
