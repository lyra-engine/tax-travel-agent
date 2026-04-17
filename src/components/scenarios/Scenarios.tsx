import { useEffect, useMemo, useState } from "react";
import type { FilingStatus } from "../../lib/advisor/types";

type Preset = "roth" | "state_move" | "entity";

const PRESETS: Array<{ id: Preset; title: string; desc: string }> = [
  {
    id: "roth",
    title: "Roth conversion: this year vs. 5-year ladder",
    desc: "Convert the whole pretax balance in one year vs. spreading it out to stay inside a target bracket.",
  },
  {
    id: "state_move",
    title: "Residency: stay in high-tax vs. move to no-income-tax state",
    desc: "Compare federal + state tax burden between two states for the same taxable income.",
  },
  {
    id: "entity",
    title: "Business structure: Sole-prop vs. S-corp vs. C-corp",
    desc: "Same net business income, three entity wrappers.",
  },
];

export default function Scenarios() {
  const [preset, setPreset] = useState<Preset>("roth");

  return (
    <div className="space-y-6">
      {/* preset pills */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
              preset === p.id
                ? "border-brand-500/60 bg-brand-500/10 text-white shadow-lg shadow-brand-500/10"
                : "border-white/10 bg-white/[0.02] text-ink-300 hover:border-white/20 hover:bg-white/5"
            }`}
          >
            <div className="font-medium">{p.title}</div>
            <div className="mt-0.5 text-xs text-ink-400">{p.desc}</div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-ink-900/40 to-ink-950/40 p-6">
        {preset === "roth" && <RothScenario />}
        {preset === "state_move" && <StateMoveScenario />}
        {preset === "entity" && <EntityScenario />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* utilities                                                                  */
/* -------------------------------------------------------------------------- */

async function compute<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
): Promise<T | { error: string }> {
  const res = await fetch("/api/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  const j = await res.json();
  if (!j.ok) return { error: j.error ?? "unknown error" };
  return j.result as T;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtPct(n: number, digits = 1): string {
  return (n * 100).toFixed(digits) + "%";
}

type SideBySideProps = {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  delta?: { label: string; value: string; positive?: boolean };
};

function SideBySide({ label, a, b, delta }: SideBySideProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">{label}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">{a}</div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">{b}</div>
      </div>
      {delta && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            delta.positive
              ? "border-accent-500/30 bg-accent-500/10 text-accent-200"
              : "border-warn-500/30 bg-warn-500/10 text-warn-200"
          }`}
        >
          <span className="uppercase tracking-wider text-[11px] opacity-80">{delta.label}</span>
          <span className="font-mono text-base font-semibold">{delta.value}</span>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-ink-400">
      {label}
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  step = 1000,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value || 0))}
      className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm font-mono text-white outline-none focus:border-brand-500"
    />
  );
}

function FilingSelect({
  value,
  onChange,
}: {
  value: FilingStatus;
  onChange: (fs: FilingStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FilingStatus)}
      className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
    >
      <option value="single">Single</option>
      <option value="mfj">Married filing jointly</option>
      <option value="mfs">Married filing separately</option>
      <option value="hoh">Head of household</option>
      <option value="qw">Qualifying widow(er)</option>
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* Roth: lump sum vs. ladder                                                  */
/* -------------------------------------------------------------------------- */

function RothScenario() {
  const [balance, setBalance] = useState(500_000);
  const [baseline, setBaseline] = useState(180_000);
  const [filing, setFiling] = useState<FilingStatus>("mfj");
  const [years, setYears] = useState(5);
  const [targetRate, setTargetRate] = useState<0.22 | 0.24 | 0.32 | 0.35>(0.24);

  const [lump, setLump] = useState<unknown>(null);
  const [ladder, setLadder] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      compute("federal_tax_estimate", {
        taxable_income: baseline + balance,
        filing_status: filing,
        ltcg: 0,
      }),
      compute("federal_tax_estimate", {
        taxable_income: baseline,
        filing_status: filing,
        ltcg: 0,
      }),
      compute("roth_conversion_ladder", {
        pretax_balance: balance,
        years,
        filing_status: filing,
        baseline_taxable_income: baseline,
        target_top_rate: targetRate,
      }),
    ]).then(([lumpAll, lumpBase, ladderRes]) => {
      if (cancelled) return;
      setLump({ all: lumpAll, base: lumpBase });
      setLadder(ladderRes);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [balance, baseline, filing, years, targetRate]);

  const lumpTax = useMemo(() => {
    const l = lump as { all?: { tax?: number }; base?: { tax?: number } } | null;
    if (!l?.all?.tax || l?.base?.tax == null) return null;
    return l.all.tax - l.base.tax;
  }, [lump]);
  const ladderTax = (ladder as { total_federal_tax_on_conversions?: number } | null)
    ?.total_federal_tax_on_conversions;
  const savings = lumpTax != null && ladderTax != null ? lumpTax - ladderTax : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-5">
        <FieldRow label="Pretax balance"><NumInput value={balance} onChange={setBalance} step={25_000} /></FieldRow>
        <FieldRow label="Baseline taxable income"><NumInput value={baseline} onChange={setBaseline} step={5_000} /></FieldRow>
        <FieldRow label="Filing status"><FilingSelect value={filing} onChange={setFiling} /></FieldRow>
        <FieldRow label="Years">
          <NumInput value={years} onChange={(n) => setYears(Math.max(1, Math.min(20, n)))} step={1} />
        </FieldRow>
        <FieldRow label="Target top bracket">
          <select
            value={targetRate}
            onChange={(e) => setTargetRate(Number(e.target.value) as 0.22 | 0.24 | 0.32 | 0.35)}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
          >
            <option value={0.22}>22%</option>
            <option value={0.24}>24%</option>
            <option value={0.32}>32%</option>
            <option value={0.35}>35%</option>
          </select>
        </FieldRow>
      </div>

      {loading && <p className="text-xs text-ink-400">Computing…</p>}

      <SideBySide
        label="Federal tax on conversions"
        a={
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">Option A — Lump sum</p>
            <p className="mt-1 text-sm text-ink-300">Convert the entire balance in year 1.</p>
            <div className="mt-4 space-y-1 text-sm">
              <Row label="Incremental federal tax" value={lumpTax != null ? fmtUsd(lumpTax) : "—"} accent />
              <Row
                label="Effective conversion rate"
                value={lumpTax != null && balance > 0 ? fmtPct(lumpTax / balance) : "—"}
              />
              <Row
                label="Pushed into top bracket"
                value={(() => {
                  const l = lump as { all?: { marginal_rate?: number } } | null;
                  return l?.all?.marginal_rate != null ? fmtPct(l.all.marginal_rate, 0) : "—";
                })()}
              />
            </div>
          </div>
        }
        b={
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">Option B — {years}-year ladder</p>
            <p className="mt-1 text-sm text-ink-300">
              Fill the {fmtPct(targetRate, 0)} bracket each year.
            </p>
            <div className="mt-4 space-y-1 text-sm">
              <Row
                label="Total tax on conversions"
                value={ladderTax != null ? fmtUsd(ladderTax) : "—"}
                accent
              />
              <Row
                label="Blended effective rate"
                value={(() => {
                  const l = ladder as { average_effective_conversion_rate?: number } | null;
                  return l?.average_effective_conversion_rate != null
                    ? fmtPct(l.average_effective_conversion_rate)
                    : "—";
                })()}
              />
              <Row
                label="Converted"
                value={(() => {
                  const l = ladder as { total_converted?: number } | null;
                  return l?.total_converted != null ? fmtUsd(l.total_converted) : "—";
                })()}
              />
              <Row
                label="Remaining pretax"
                value={(() => {
                  const l = ladder as { remaining_pretax_balance?: number } | null;
                  return l?.remaining_pretax_balance != null
                    ? fmtUsd(l.remaining_pretax_balance)
                    : "—";
                })()}
              />
            </div>
          </div>
        }
        delta={
          savings != null
            ? {
                label: savings >= 0 ? "Ladder saves" : "Ladder costs more",
                value: fmtUsd(Math.abs(savings)),
                positive: savings >= 0,
              }
            : undefined
        }
      />

      {ladder != null && (ladder as { years?: unknown[] }).years != null && (
        <LadderTable years={(ladder as { years: LadderYear[] }).years} />
      )}
    </div>
  );
}

type LadderYear = {
  year_index: number;
  conversion_amount: number;
  taxable_income_after: number;
  incremental_tax: number;
  effective_conversion_rate: number;
};

function LadderTable({ years }: { years: LadderYear[] }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02]">
      <div className="border-b border-white/5 px-4 py-2 text-xs uppercase tracking-wider text-ink-500">
        Year-by-year conversion ladder
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-4 py-2 font-medium text-right">Converted</th>
              <th className="px-4 py-2 font-medium text-right">Taxable income after</th>
              <th className="px-4 py-2 font-medium text-right">Incremental tax</th>
              <th className="px-4 py-2 font-medium text-right">Conversion rate</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year_index} className="border-t border-white/5">
                <td className="px-4 py-2 font-mono text-ink-300">{y.year_index}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-100">
                  {fmtUsd(y.conversion_amount)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-300">
                  {fmtUsd(y.taxable_income_after)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-100">
                  {fmtUsd(y.incremental_tax)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-brand-300">
                  {fmtPct(y.effective_conversion_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* State move                                                                 */
/* -------------------------------------------------------------------------- */

function StateMoveScenario() {
  const [taxable, setTaxable] = useState(350_000);
  const [filing, setFiling] = useState<FilingStatus>("mfj");
  const [from, setFrom] = useState("NY");
  const [to, setTo] = useState("FL");

  const [fromRes, setFromRes] = useState<unknown>(null);
  const [toRes, setToRes] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      compute("state_tax_estimate", {
        state: from,
        taxable_income: taxable,
        filing_status: filing,
      }),
      compute("state_tax_estimate", {
        state: to,
        taxable_income: taxable,
        filing_status: filing,
      }),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setFromRes(a);
      setToRes(b);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [from, to, taxable, filing]);

  const tA = (fromRes as { tax?: number } | null)?.tax;
  const tB = (toRes as { tax?: number } | null)?.tax;
  const savings = tA != null && tB != null ? tA - tB : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <FieldRow label="Taxable income"><NumInput value={taxable} onChange={setTaxable} step={10_000} /></FieldRow>
        <FieldRow label="Filing status"><FilingSelect value={filing} onChange={setFiling} /></FieldRow>
        <FieldRow label="Current state">
          <StateSelect value={from} onChange={setFrom} />
        </FieldRow>
        <FieldRow label="Proposed state">
          <StateSelect value={to} onChange={setTo} />
        </FieldRow>
      </div>

      {loading && <p className="text-xs text-ink-400">Computing…</p>}

      <SideBySide
        label="Annual state income tax"
        a={<StateCard label="Stay" stateCode={from} result={fromRes} />}
        b={<StateCard label="Move" stateCode={to} result={toRes} />}
        delta={
          savings != null
            ? {
                label: savings >= 0 ? "Move saves / yr" : "Move costs more / yr",
                value: fmtUsd(Math.abs(savings)),
                positive: savings >= 0,
              }
            : undefined
        }
      />
      <p className="text-xs text-ink-500">
        Excludes federal tax (constant across states), local taxes (e.g. NYC),
        exit tax rules, and residency establishment risk.
      </p>
    </div>
  );
}

function StateCard({
  label,
  stateCode,
  result,
}: {
  label: string;
  stateCode: string;
  result: unknown;
}) {
  const r = result as {
    tax?: number;
    effective_rate?: number;
    marginal_rate?: number;
    type?: string;
    notes?: string[];
    error?: string;
  } | null;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">{label}</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-sm text-white">
          {stateCode}
        </span>
      </div>
      {r?.error ? (
        <p className="mt-3 text-sm text-danger-300">{r.error}</p>
      ) : (
        <div className="mt-3 space-y-1 text-sm">
          <Row
            label="State income tax"
            value={r?.tax != null ? fmtUsd(r.tax) : "—"}
            accent
          />
          <Row
            label="Effective rate"
            value={r?.effective_rate != null ? fmtPct(r.effective_rate, 2) : "—"}
          />
          <Row
            label="Marginal rate"
            value={r?.marginal_rate != null ? fmtPct(r.marginal_rate, 2) : "—"}
          />
          <Row label="Type" value={r?.type ?? "—"} />
          {r?.notes && r.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-400">
              {r.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
    >
      <optgroup label="Income tax">
        <option value="CA">California</option>
        <option value="NY">New York</option>
        <option value="NJ">New Jersey</option>
        <option value="MA">Massachusetts</option>
        <option value="IL">Illinois</option>
        <option value="PA">Pennsylvania</option>
      </optgroup>
      <optgroup label="No income tax">
        <option value="FL">Florida</option>
        <option value="TX">Texas</option>
        <option value="WA">Washington</option>
        <option value="NV">Nevada</option>
        <option value="TN">Tennessee</option>
        <option value="NH">New Hampshire</option>
        <option value="SD">South Dakota</option>
        <option value="WY">Wyoming</option>
        <option value="AK">Alaska</option>
      </optgroup>
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* Entity comparison                                                          */
/* -------------------------------------------------------------------------- */

function EntityScenario() {
  const [netIncome, setNetIncome] = useState(250_000);
  const [filing, setFiling] = useState<FilingStatus>("single");
  const [otherWages, setOtherWages] = useState(0);
  const [salaryPct, setSalaryPct] = useState(0.4);
  const [qbi, setQbi] = useState(true);
  const [stateRate, setStateRate] = useState(0);

  const [res, setRes] = useState<Array<{
    entity: string;
    federal_income_tax: number;
    self_employment_or_fica_tax: number;
    additional_medicare: number;
    qbi_deduction: number;
    corporate_tax: number;
    shareholder_dividend_tax: number;
    state_tax_estimate: number;
    total_tax: number;
    effective_total_rate: number;
    notes: string[];
  }> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    compute("entity_comparison", {
      net_business_income: netIncome,
      filing_status: filing,
      other_wages: otherWages,
      reasonable_salary_pct: salaryPct,
      qbi_eligible: qbi,
      state_marginal_rate: stateRate,
    }).then((r) => {
      if (cancelled) return;
      if (Array.isArray(r)) setRes(r as typeof res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [netIncome, filing, otherWages, salaryPct, qbi, stateRate]);

  const best = useMemo(() => {
    if (!res) return null;
    return [...res].sort((a, b) => a.total_tax - b.total_tax)[0];
  }, [res]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-6">
        <FieldRow label="Net business income"><NumInput value={netIncome} onChange={setNetIncome} step={10_000} /></FieldRow>
        <FieldRow label="Filing"><FilingSelect value={filing} onChange={setFiling} /></FieldRow>
        <FieldRow label="Other W-2 wages"><NumInput value={otherWages} onChange={setOtherWages} step={5_000} /></FieldRow>
        <FieldRow label="S-corp salary %">
          <input
            type="number"
            step="0.05"
            min="0.1"
            max="0.95"
            value={salaryPct}
            onChange={(e) => setSalaryPct(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm font-mono text-white outline-none focus:border-brand-500"
          />
        </FieldRow>
        <FieldRow label="QBI eligible?">
          <select
            value={qbi ? "y" : "n"}
            onChange={(e) => setQbi(e.target.value === "y")}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-500"
          >
            <option value="y">Yes</option>
            <option value="n">No</option>
          </select>
        </FieldRow>
        <FieldRow label="State marginal">
          <input
            type="number"
            step="0.005"
            min="0"
            max="0.15"
            value={stateRate}
            onChange={(e) => setStateRate(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm font-mono text-white outline-none focus:border-brand-500"
          />
        </FieldRow>
      </div>

      {loading && <p className="text-xs text-ink-400">Computing…</p>}

      {res && (
        <div className="grid gap-4 lg:grid-cols-3">
          {res.map((r) => (
            <div
              key={r.entity}
              className={`rounded-xl border p-4 ${
                r === best
                  ? "border-accent-500/40 bg-accent-500/10"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">
                  {prettyEntity(r.entity)}
                </div>
                {r === best && (
                  <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-300">
                    Lowest total
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label="Federal income tax" value={fmtUsd(r.federal_income_tax)} />
                <Row label="SE / FICA tax" value={fmtUsd(r.self_employment_or_fica_tax)} />
                {r.additional_medicare > 0 && (
                  <Row label="Addl. Medicare" value={fmtUsd(r.additional_medicare)} />
                )}
                {r.qbi_deduction > 0 && (
                  <Row label="QBI deduction" value={"-" + fmtUsd(r.qbi_deduction)} />
                )}
                {r.corporate_tax > 0 && (
                  <Row label="C-corp tax" value={fmtUsd(r.corporate_tax)} />
                )}
                {r.shareholder_dividend_tax > 0 && (
                  <Row
                    label="Qualified div. tax"
                    value={fmtUsd(r.shareholder_dividend_tax)}
                  />
                )}
                {r.state_tax_estimate > 0 && (
                  <Row label="State tax" value={fmtUsd(r.state_tax_estimate)} />
                )}
                <div className="my-2 h-px bg-white/10" />
                <Row label="Total tax" value={fmtUsd(r.total_tax)} accent />
                <Row
                  label="Effective rate"
                  value={fmtPct(r.effective_total_rate, 1)}
                />
              </div>
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-ink-400">
                {r.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function prettyEntity(e: string): string {
  switch (e) {
    case "sole_prop":
      return "Sole prop / LLC";
    case "s_corp":
      return "S-Corp";
    case "c_corp":
      return "C-Corp";
    default:
      return e;
  }
}

/* -------------------------------------------------------------------------- */
/* shared tiny table row                                                       */
/* -------------------------------------------------------------------------- */

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-ink-400">{label}</span>
      <span
        className={
          accent
            ? "font-mono text-base font-semibold text-white"
            : "font-mono text-sm text-ink-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
