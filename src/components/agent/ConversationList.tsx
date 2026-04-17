import type { Client, Conversation } from "../../lib/advisor/types";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  clients: Client[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function ConversationList({
  conversations,
  activeId,
  clients,
  onSelect,
  onDelete,
}: Props) {
  return (
    <div className="card flex flex-col gap-0.5 overflow-hidden p-2">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-ink-500">
        Recent ({conversations.length})
      </p>
      {conversations.length === 0 && (
        <p className="px-2 py-3 text-xs text-ink-500">
          No conversations yet. Start one above.
        </p>
      )}
      <div className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
        {conversations.map((c) => {
          const client = clients.find((cl) => cl.id === c.clientId);
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className={`group flex items-start gap-2 rounded-md px-2 py-1.5 ${
                active ? "bg-brand-500/10" : "hover:bg-white/5"
              }`}
            >
              <button
                className="flex min-w-0 flex-1 flex-col items-start text-left"
                onClick={() => onSelect(c.id)}
              >
                <span className="line-clamp-1 text-sm text-white">{c.title}</span>
                <span className="truncate text-xs text-ink-500">
                  {client?.name ?? "No client"} ·{" "}
                  {new Date(c.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </button>
              <button
                onClick={() => onDelete(c.id)}
                className="rounded p-1 text-ink-500 opacity-0 transition hover:bg-danger-500/15 hover:text-danger-400 group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
