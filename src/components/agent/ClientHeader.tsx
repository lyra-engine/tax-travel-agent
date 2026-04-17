import type { Client } from "../../lib/advisor/types";
import { FILING_STATUS_LABEL } from "../../lib/advisor/types";

type Props = {
  clients: Client[];
  activeClient?: Client;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onExport: () => void;
  onOpenMemo?: () => void;
  canExport: boolean;
};

export default function ClientHeader({
  clients,
  activeClient,
  onSelect,
  onEdit,
  onExport,
  onOpenMemo,
  canExport,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">Client</span>
        <select
          value={activeClient?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="">— No client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {activeClient && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Chip>{FILING_STATUS_LABEL[activeClient.filingStatus]}</Chip>
          {activeClient.state && <Chip>{activeClient.state}</Chip>}
          {activeClient.age != null && <Chip>age {activeClient.age}</Chip>}
          {activeClient.income?.wages != null && (
            <Chip>W-2 {fmtK(activeClient.income.wages)}</Chip>
          )}
          {activeClient.income?.selfEmployment != null && activeClient.income.selfEmployment > 0 && (
            <Chip>SE {fmtK(activeClient.income.selfEmployment)}</Chip>
          )}
          {(activeClient.trips?.length ?? 0) > 0 && (
            <Chip>{activeClient.trips!.length} trips</Chip>
          )}
          {activeClient.tags?.map((t) => (
            <Chip key={t} tone="brand">
              {t}
            </Chip>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        {activeClient && (
          <button
            onClick={onEdit}
            className="rounded-md px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
          >
            Edit profile
          </button>
        )}
        <button
          onClick={onExport}
          disabled={!canExport}
          className="rounded-md px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          title="Export conversation as Markdown memo"
        >
          Markdown
        </button>
        <button
          onClick={onOpenMemo}
          disabled={!canExport || !onOpenMemo}
          className="rounded-md bg-white/5 px-2.5 py-1.5 text-xs font-medium text-ink-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          title="Open printable memo (Save as PDF from browser)"
        >
          PDF memo →
        </button>
      </div>
    </div>
  );
}

function Chip({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "brand";
}) {
  const cls =
    tone === "brand"
      ? "bg-brand-500/15 text-brand-300 border-brand-500/30"
      : "bg-white/5 text-ink-200 border-white/10";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}
