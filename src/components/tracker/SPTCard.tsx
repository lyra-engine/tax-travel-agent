import type { SPTResult } from "../../lib/calc";
import { fmtDate } from "../../lib/calc";

type Props = { result: SPTResult };

export default function SPTCard({ result }: Props) {
  const {
    currentYear,
    daysCurrent,
    daysPriorRaw,
    daysTwoPriorRaw,
    weightedTotal,
    meetsTest,
    meets31DayMin,
    thresholdReachedOn,
  } = result;

  const priorWeighted = daysPriorRaw / 3;
  const twoPriorWeighted = daysTwoPriorRaw / 6;
  const pct = Math.min(100, Math.round((weightedTotal / 183) * 100));

  const barColor = meetsTest
    ? "bg-danger-500"
    : pct >= 75
      ? "bg-warn-500"
      : "bg-accent-500";

  const badge = meetsTest
    ? { label: "Meets test", cls: "bg-danger-500/15 text-danger-400" }
    : pct >= 75
      ? { label: "Approaching", cls: "bg-warn-500/15 text-warn-400" }
      : { label: "Not met", cls: "bg-accent-500/15 text-accent-400" };

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">🇺🇸</span>
            <h3 className="text-base font-semibold text-white">
              US Substantial Presence Test
            </h3>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            Includes days spent anywhere in the US — any US-state entry counts
            toward federal presence. 31-day minimum:{" "}
            <span className={meets31DayMin ? "text-accent-400" : "text-warn-400"}>
              {meets31DayMin ? "met" : "not met"}
            </span>
            .
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-500">Weighted total</p>
          <p className="text-3xl font-semibold tabular-nums text-white">
            {weightedTotal.toFixed(1)}
            <span className="text-sm font-normal text-ink-400"> / 183</span>
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full ${barColor} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SPTRow
          year={currentYear}
          label="Current year"
          factor="× 1"
          raw={daysCurrent}
          weighted={daysCurrent}
        />
        <SPTRow
          year={currentYear - 1}
          label="Prior year"
          factor="× ⅓"
          raw={daysPriorRaw}
          weighted={priorWeighted}
        />
        <SPTRow
          year={currentYear - 2}
          label="Two years prior"
          factor="× ⅙"
          raw={daysTwoPriorRaw}
          weighted={twoPriorWeighted}
        />
      </div>

      {thresholdReachedOn && (
        <p className="mt-5 rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-300">
          Based on your log, you crossed the 183-weighted-day line on{" "}
          <b>{fmtDate(thresholdReachedOn)}</b>.
        </p>
      )}
    </div>
  );
}

function SPTRow({
  year,
  label,
  factor,
  raw,
  weighted,
}: {
  year: number;
  label: string;
  factor: string;
  raw: number;
  weighted: number;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-400">{label}</span>
        <span className="text-[11px] text-ink-500">{year}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums text-white">{raw}</span>
        <span className="text-xs text-ink-500">days {factor}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-400">
        contributes <span className="tabular-nums text-ink-200">{weighted.toFixed(1)}</span>
      </p>
    </div>
  );
}
