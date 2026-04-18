import type { Client } from "../../lib/advisor/types";
import { FILING_STATUS_LABEL } from "../../lib/advisor/types";

type Props = {
  clients: Client[];
  activeClient?: Client;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onExport: () => void;
  /** Copy /tracker journal trips into the active client (replaces client trip list). */
  onSyncJournal?: () => void;
  onOpenMemo?: () => void;
  canExport: boolean;
};

export default function ClientHeader({
  clients,
  activeClient,
  onSelect,
  onEdit,
  onExport,
  onSyncJournal,
  onOpenMemo,
  canExport,
}: Props) {
  return (
    <div className="flex flex-col border-b border-white/[0.06]">
      {/* Row 1: client selector + actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="label-xs">Client</span>
          <div className="relative">
            <select
              value={activeClient?.id ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              className="appearance-none bg-transparent pr-6 font-display text-[17px] font-light tracking-tight text-white outline-none hover:text-brand-300 focus:text-brand-300"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none' stroke='%23aab1c6' stroke-width='1.4'><path d='M2 4l3 3 3-3'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0 center",
              }}
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {activeClient && (
            <button onClick={onEdit} className="btn-link">
              Edit profile
            </button>
          )}
          {activeClient && onSyncJournal && (
            <button
              type="button"
              onClick={onSyncJournal}
              className="btn-link"
              title="Replace this client’s trip list with the global residency journal from /tracker"
            >
              Journal → client
            </button>
          )}
          <button
            onClick={onExport}
            disabled={!canExport}
            className="btn-link"
            title="Export as Markdown memo"
          >
            Markdown
          </button>
          <button
            onClick={onOpenMemo}
            disabled={!canExport || !onOpenMemo}
            className="btn-link text-white hover:text-brand-300 disabled:text-ink-500"
            title="Open printable PDF memo"
          >
            PDF memo →
          </button>
        </div>
      </div>

      {/* Row 2: tags / vitals */}
      {activeClient && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.04] bg-black/10 px-6 py-2.5">
          <span className="tag">{FILING_STATUS_LABEL[activeClient.filingStatus]}</span>
          {activeClient.state && <span className="tag">{activeClient.state}</span>}
          {activeClient.age != null && <span className="tag">age {activeClient.age}</span>}
          {activeClient.income?.wages != null && (
            <span className="tag">W-2 <span className="data-num ml-1">{fmtK(activeClient.income.wages)}</span></span>
          )}
          {activeClient.income?.selfEmployment != null && activeClient.income.selfEmployment > 0 && (
            <span className="tag">SE <span className="data-num ml-1">{fmtK(activeClient.income.selfEmployment)}</span></span>
          )}
          {(activeClient.trips?.length ?? 0) > 0 && (
            <span className="tag">
              <span className="data-num">{activeClient.trips!.length}</span> trips
            </span>
          )}
          {activeClient.tags?.map((t) => (
            <span key={t} className="tag tag-accent">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}
