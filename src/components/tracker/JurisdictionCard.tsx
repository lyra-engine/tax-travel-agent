import type { Jurisdiction } from "../../lib/types";
import type { ThresholdStatus } from "../../lib/calc";

type Props = {
  jurisdiction: Jurisdiction;
  days: number;
  status: ThresholdStatus;
};

const LEVEL = {
  safe: {
    badge: "bg-accent-500/15 text-accent-400",
    bar: "bg-accent-500",
    label: "Safe",
  },
  warn: {
    badge: "bg-warn-500/15 text-warn-400",
    bar: "bg-warn-500",
    label: "Warning",
  },
  over: {
    badge: "bg-danger-500/15 text-danger-400",
    bar: "bg-danger-500",
    label: "Over",
  },
} as const;

export default function JurisdictionCard({ jurisdiction, days, status }: Props) {
  const t = status.thresholdDays;
  const pct = Math.min(100, Math.round((status.progress ?? 0) * 100));
  const style = LEVEL[status.level];
  const noThreshold = t == null;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl leading-none">{jurisdiction.flag}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {jurisdiction.name}
            </p>
            <p className="text-xs text-ink-500">
              {jurisdiction.group === "us-state" ? "US state" : "Country"}
            </p>
          </div>
        </div>
        {!noThreshold && (
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${style.badge}`}
          >
            {style.label}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums text-white">{days}</span>
        {!noThreshold ? (
          <span className="text-sm text-ink-400">/ {t} days</span>
        ) : (
          <span className="text-sm text-ink-400">days</span>
        )}
      </div>

      {!noThreshold && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className={`h-full ${style.bar} transition-[width] duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p className="mt-3 min-h-[2.25em] text-xs text-ink-400">
        {noThreshold ? (
          jurisdiction.notes?.[0] ?? "No simple day-based residency rule modeled."
        ) : status.level === "over" ? (
          <>You're {days - (t as number)} days over the {jurisdiction.threshold?.label ?? "threshold"}.</>
        ) : status.level === "warn" ? (
          <>Only {status.remaining} days left before {jurisdiction.threshold?.label ?? "the threshold"} triggers.</>
        ) : (
          <>{status.remaining} days remaining before {jurisdiction.threshold?.label ?? "the threshold"}.</>
        )}
      </p>

      {jurisdiction.threshold && (
        <details className="group mt-2">
          <summary className="cursor-pointer select-none text-xs text-ink-500 hover:text-ink-300">
            What does this mean?
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            {jurisdiction.threshold.description}
          </p>
          {jurisdiction.notes && jurisdiction.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-500">
              {jurisdiction.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}
