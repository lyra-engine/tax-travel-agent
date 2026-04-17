import { useEffect, useMemo, useRef, useState } from "react";
import type { Client, FilingStatus } from "../../lib/advisor/types";
import { loadClients, saveClients } from "../../lib/advisor/store";

type Extraction = {
  detected_type?: string;
  tax_year?: number | null;
  taxpayer_name?: string | null;
  taxpayer_ssn_last4?: string | null;
  employer_or_payer?: string | null;
  state?: string | null;
  fields?: Record<string, number | null | undefined>;
  filing_status_1040?: FilingStatus | null;
  dependents_1040?: number | null;
  confidence?: "high" | "medium" | "low";
  notes?: string;
};

export default function DocumentIntake() {
  const [hydrated, setHydrated] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [targetClientId, setTargetClientId] = useState<string>("new");
  const [newClientName, setNewClientName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [docType, setDocType] = useState<"auto" | "w2" | "1099" | "1040">("auto");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setClients(loadClients());
    setHydrated(true);
  }, []);

  const onFile = async (file: File | null | undefined) => {
    setError(null);
    setExtraction(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(
        "PDFs aren't supported yet. Export the relevant page as a JPG/PNG and try again.",
      );
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const runParse = async () => {
    if (!imageDataUrl) return;
    setLoading(true);
    setError(null);
    setExtraction(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          docType: docType === "auto" ? undefined : docType,
          filename: fileName,
        }),
      });
      const j = await res.json();
      if (!j.ok) setError(j.error ?? "Unknown error");
      else setExtraction(j.extraction as Extraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) {
    return <div className="text-sm text-ink-400">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* left: uploader */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("ring-2", "ring-brand-500/40");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("ring-2", "ring-brand-500/40");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("ring-2", "ring-brand-500/40");
              const f = e.dataTransfer.files?.[0];
              onFile(f);
            }}
            onPaste={(e) => {
              const f = Array.from(e.clipboardData.items)
                .find((it) => it.kind === "file")
                ?.getAsFile();
              if (f) onFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="card flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-6 text-center transition hover:border-brand-500/40 hover:bg-white/5"
          >
            {imageDataUrl ? (
              <>
                <img
                  src={imageDataUrl}
                  alt="Uploaded document"
                  className="max-h-64 rounded-lg border border-white/10 object-contain"
                />
                <p className="text-xs text-ink-400">{fileName}</p>
                <p className="text-[11px] text-ink-500">Click or drop to replace.</p>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-10 w-10 text-ink-500">
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                  <path d="M12 11v6" />
                  <path d="m9 14 3-3 3 3" />
                </svg>
                <p className="text-sm text-ink-200">Drop or click to upload an image</p>
                <p className="text-xs text-ink-500">W-2 · 1099 · 1040 (page) · PNG / JPG / WEBP · paste from clipboard works too</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-ink-400">
              Document type hint
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as typeof docType)}
                className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
              >
                <option value="auto">Auto-detect</option>
                <option value="w2">W-2</option>
                <option value="1099">1099 (any)</option>
                <option value="1040">Form 1040</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-ink-400">
              Target client
              <select
                value={targetClientId}
                onChange={(e) => setTargetClientId(e.target.value)}
                className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
              >
                <option value="new">+ Create new client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {targetClientId === "new" && (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-ink-400">
              New client name
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Jane Doe"
                className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
              />
            </label>
          )}

          <div className="flex gap-2">
            <button
              onClick={runParse}
              disabled={!imageDataUrl || loading}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/20 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Parsing with vision…" : "Parse document"}
            </button>
            {imageDataUrl && (
              <button
                onClick={() => {
                  setImageDataUrl(null);
                  setFileName("");
                  setExtraction(null);
                  setError(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-300 hover:bg-white/5"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-200">
              {error}
            </div>
          )}
        </div>

        {/* right: extraction */}
        <div className="lg:col-span-3">
          {!extraction ? (
            <EmptyExtractionPane />
          ) : (
            <ExtractionPane
              extraction={extraction}
              clients={clients}
              targetClientId={targetClientId}
              newClientName={newClientName}
              onApplied={(c) => {
                const updated = loadClients();
                setClients(updated);
                setTargetClientId(c.id);
                setExtraction(null);
                setImageDataUrl(null);
                setFileName("");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyExtractionPane() {
  return (
    <div className="card flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <p className="text-sm text-ink-300">
        Upload a document on the left, then click <b>Parse document</b>. I'll extract
        the fields, show a diff against the target client, and let you cherry-pick
        what to apply.
      </p>
      <p className="mt-3 text-xs text-ink-500">
        Runs on <code className="rounded bg-white/5 px-1 font-mono">gpt-4o-mini</code>{" "}
        with vision. SSNs are truncated to the last 4 digits before storage.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Extraction diff + merge                                                    */
/* -------------------------------------------------------------------------- */

type MergeRow = {
  key: string;
  label: string;
  current: string | number | undefined | null;
  proposed: string | number | undefined | null;
  apply: (c: Client, v: number | string) => Client;
  format?: "usd" | "text" | "int";
};

function ExtractionPane({
  extraction,
  clients,
  targetClientId,
  newClientName,
  onApplied,
}: {
  extraction: Extraction;
  clients: Client[];
  targetClientId: string;
  newClientName: string;
  onApplied: (c: Client) => void;
}) {
  const current =
    targetClientId === "new"
      ? undefined
      : clients.find((c) => c.id === targetClientId);

  const rows: MergeRow[] = useMemo(() => {
    const f = extraction.fields ?? {};
    const name = extraction.taxpayer_name ?? (targetClientId === "new" ? newClientName : null);
    const r: MergeRow[] = [];

    r.push({
      key: "name",
      label: "Name",
      current: current?.name,
      proposed: name ?? undefined,
      apply: (c, v) => ({ ...c, name: String(v) }),
      format: "text",
    });

    r.push({
      key: "state",
      label: "State",
      current: current?.state,
      proposed: extraction.state ?? undefined,
      apply: (c, v) => ({ ...c, state: String(v) }),
      format: "text",
    });

    if (extraction.filing_status_1040) {
      r.push({
        key: "filingStatus",
        label: "Filing status",
        current: current?.filingStatus,
        proposed: extraction.filing_status_1040,
        apply: (c, v) => ({ ...c, filingStatus: v as FilingStatus }),
        format: "text",
      });
    }

    if (extraction.dependents_1040 != null) {
      r.push({
        key: "dependents",
        label: "Dependents",
        current: current?.dependents,
        proposed: extraction.dependents_1040 ?? undefined,
        apply: (c, v) => ({ ...c, dependents: Number(v) }),
        format: "int",
      });
    }

    const wages = pick(f.wages, f.social_security_wages, f.medicare_wages);
    if (wages != null) {
      r.push({
        key: "wages",
        label: "Wages (W-2)",
        current: current?.income?.wages,
        proposed: wages,
        apply: (c, v) => ({
          ...c,
          income: { ...(c.income ?? {}), wages: Number(v) },
        }),
        format: "usd",
      });
    }
    if (f.nonemployee_compensation != null) {
      r.push({
        key: "se",
        label: "Self-employment (1099-NEC)",
        current: current?.income?.selfEmployment,
        proposed: f.nonemployee_compensation,
        apply: (c, v) => ({
          ...c,
          income: { ...(c.income ?? {}), selfEmployment: Number(v) },
        }),
        format: "usd",
      });
    }
    const inv = sumNonNull(f.interest_income, f.ordinary_dividends, f.capital_gains);
    if (inv != null) {
      r.push({
        key: "investment",
        label: "Investment (interest + div + CG)",
        current: current?.income?.investment,
        proposed: inv,
        apply: (c, v) => ({
          ...c,
          income: { ...(c.income ?? {}), investment: Number(v) },
        }),
        format: "usd",
      });
    }
    if (f.rental_income != null) {
      r.push({
        key: "rental",
        label: "Rental income",
        current: current?.income?.rental,
        proposed: f.rental_income,
        apply: (c, v) => ({
          ...c,
          income: { ...(c.income ?? {}), rental: Number(v) },
        }),
        format: "usd",
      });
    }
    if (f.agi_1040 != null) {
      r.push({
        key: "agi_note",
        label: "AGI (1040) — note only",
        current: undefined,
        proposed: f.agi_1040,
        apply: (c) => c,
        format: "usd",
      });
    }
    if (f.total_tax_1040 != null) {
      r.push({
        key: "total_tax_note",
        label: "Total tax (1040) — note only",
        current: undefined,
        proposed: f.total_tax_1040,
        apply: (c) => c,
        format: "usd",
      });
    }
    return r;
  }, [extraction, current, targetClientId, newClientName]);

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const r of rows) {
      if (r.proposed != null && r.proposed !== "" && !r.key.endsWith("_note")) {
        o[r.key] = true;
      }
    }
    return o;
  });

  // Reset checks when rows change
  useEffect(() => {
    const o: Record<string, boolean> = {};
    for (const r of rows) {
      if (r.proposed != null && r.proposed !== "" && !r.key.endsWith("_note")) {
        o[r.key] = true;
      }
    }
    setChecked(o);
  }, [rows]);

  const hasAnyApplicable = rows.some((r) => checked[r.key] && !r.key.endsWith("_note"));

  const applyAll = () => {
    const existing = current;
    let target: Client =
      existing ?? {
        id: crypto.randomUUID(),
        name: newClientName || extraction.taxpayer_name || "New client",
        filingStatus: (extraction.filing_status_1040 ?? "single") as FilingStatus,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

    for (const r of rows) {
      if (!checked[r.key]) continue;
      if (r.key.endsWith("_note")) continue;
      if (r.proposed == null || r.proposed === "") continue;
      target = r.apply(target, r.proposed);
    }
    target = { ...target, updatedAt: Date.now() };

    const all = loadClients();
    const idx = all.findIndex((c) => c.id === target.id);
    const next = idx >= 0
      ? all.map((c) => (c.id === target.id ? target : c))
      : [target, ...all];
    saveClients(next);
    onApplied(target);
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-300">
              {extraction.detected_type ?? "unknown"}
            </span>
            {extraction.tax_year != null && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-ink-300">
                TY {extraction.tax_year}
              </span>
            )}
            <ConfidenceBadge confidence={extraction.confidence} />
          </div>
          <h2 className="mt-2 text-base font-semibold text-white">
            {extraction.taxpayer_name ?? "Taxpayer (not detected)"}
          </h2>
          <p className="text-xs text-ink-400">
            {[extraction.employer_or_payer, extraction.state]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {extraction.notes && (
        <p className="mt-3 rounded-lg border border-warn-500/30 bg-warn-500/5 px-3 py-2 text-xs text-warn-200">
          {extraction.notes}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Current</th>
              <th className="px-3 py-2">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-ink-500">
                  No fields extracted from this document.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isNote = r.key.endsWith("_note");
              const changed =
                r.current !== r.proposed && r.proposed != null && r.proposed !== "";
              return (
                <tr
                  key={r.key}
                  className={`border-t border-white/5 ${
                    isNote ? "bg-white/[0.02]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      disabled={isNote || r.proposed == null || r.proposed === ""}
                      checked={!!checked[r.key]}
                      onChange={(e) =>
                        setChecked((c) => ({ ...c, [r.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink-200">
                    {r.label}
                    {isNote && (
                      <span className="ml-2 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-ink-500">
                        reference only
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-400">
                    {fmt(r.current, r.format)}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono text-xs ${
                      changed ? "text-accent-300" : "text-ink-400"
                    }`}
                  >
                    {fmt(r.proposed, r.format)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          Merges into{" "}
          {current ? (
            <b className="text-ink-200">{current.name}</b>
          ) : (
            <b className="text-ink-200">new client "{newClientName || extraction.taxpayer_name || "Untitled"}"</b>
          )}
          . Existing values are overwritten only for rows you tick.
        </p>
        <div className="flex gap-2">
          <a
            href="/agent"
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-300 hover:bg-white/5"
          >
            Cancel
          </a>
          <button
            onClick={applyAll}
            disabled={!hasAnyApplicable}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-ink-950 shadow-lg shadow-accent-500/20 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply to client →
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: "high" | "medium" | "low" }) {
  if (!confidence) return null;
  const cls =
    confidence === "high"
      ? "bg-accent-500/15 text-accent-300"
      : confidence === "medium"
        ? "bg-warn-500/15 text-warn-300"
        : "bg-danger-500/15 text-danger-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      Confidence: {confidence}
    </span>
  );
}

function fmt(v: unknown, format?: "usd" | "text" | "int"): string {
  if (v == null || v === "") return "—";
  if (format === "usd" && typeof v === "number") {
    return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (format === "int" && typeof v === "number") return String(v);
  return String(v);
}

function pick<T>(...xs: (T | null | undefined)[]): T | undefined {
  for (const x of xs) if (x != null) return x;
  return undefined;
}

function sumNonNull(...xs: (number | null | undefined)[]): number | undefined {
  let s = 0;
  let any = false;
  for (const x of xs) {
    if (x != null) {
      s += x;
      any = true;
    }
  }
  return any ? s : undefined;
}
