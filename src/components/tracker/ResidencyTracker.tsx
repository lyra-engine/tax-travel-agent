import { useEffect, useMemo, useRef, useState } from "react";
import type { DayCountMode, Settings, Trip } from "../../lib/types";
import {
  loadSettings,
  loadTrips,
  saveSettings,
  saveTrips,
  uid,
} from "../../lib/storage";
import { JURISDICTIONS, getJurisdiction } from "../../lib/jurisdictions";
import {
  fmtRange,
  statusForThreshold,
  substantialPresenceTest,
  tallyByJurisdiction,
  todayISO,
  tripLength,
  fmtDate,
} from "../../lib/calc";
import AddTripForm from "./AddTripForm";
import JurisdictionCard from "./JurisdictionCard";
import SPTCard from "./SPTCard";

const LEVEL_RANK: Record<string, number> = { over: 0, warn: 1, safe: 2 };

function classNames(...cls: Array<string | false | undefined | null>): string {
  return cls.filter(Boolean).join(" ");
}

export default function ResidencyTracker() {
  const [hydrated, setHydrated] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<Settings>({
    taxYear: new Date().getUTCFullYear(),
    dayCountMode: "inclusive",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTrips(loadTrips());
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTrips(trips);
  }, [trips, hydrated]);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  const upsertTrip = (trip: Trip) => {
    setTrips((ts) => {
      const exists = ts.some((t) => t.id === trip.id);
      return exists ? ts.map((t) => (t.id === trip.id ? trip : t)) : [...ts, trip];
    });
    setEditingId(null);
  };

  const removeTrip = (id: string) =>
    setTrips((ts) => ts.filter((t) => t.id !== id));

  const tally = useMemo(
    () => tallyByJurisdiction(trips, settings.taxYear, settings.dayCountMode),
    [trips, settings.taxYear, settings.dayCountMode],
  );

  const spt = useMemo(
    () => substantialPresenceTest(trips, settings.taxYear, settings.dayCountMode),
    [trips, settings.taxYear, settings.dayCountMode],
  );

  const sortedTally = useMemo(() => {
    const rows = [...tally.values()].map((row) => {
      const j = getJurisdiction(row.code);
      const status = statusForThreshold(row.days, j?.threshold?.days);
      return { ...row, jurisdiction: j, status };
    });
    rows.sort((a, b) => {
      const la = LEVEL_RANK[a.status.level] ?? 9;
      const lb = LEVEL_RANK[b.status.level] ?? 9;
      if (la !== lb) return la - lb;
      return b.days - a.days;
    });
    return rows;
  }, [tally]);

  const totalDaysThisYear = useMemo(
    () => sortedTally.reduce((s, r) => s + r.days, 0),
    [sortedTally],
  );

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [trips]);

  const editingTrip = editingId ? trips.find((t) => t.id === editingId) : undefined;

  const exportJSON = () => {
    const data = JSON.stringify({ version: 1, trips, settings }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trips-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming: Trip[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.trips)
            ? parsed.trips
            : [];
        const cleaned = incoming
          .filter(
            (t) =>
              t &&
              typeof t.jurisdictionCode === "string" &&
              typeof t.startDate === "string" &&
              typeof t.endDate === "string",
          )
          .map<Trip>((t) => ({
            id: t.id ?? uid(),
            jurisdictionCode: t.jurisdictionCode,
            startDate: t.startDate,
            endDate: t.endDate,
            notes: t.notes,
          }));
        if (cleaned.length === 0) {
          alert("No valid trips found in that file.");
          return;
        }
        if (confirm(`Import ${cleaned.length} trips? This replaces your current log.`)) {
          setTrips(cleaned);
        }
      } catch (err) {
        alert("Couldn't parse that file: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const loadDemo = () => {
    const y = settings.taxYear;
    const demo: Trip[] = [
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${y}-01-01`, endDate: `${y}-02-28`, notes: "Winter in NYC" },
      { id: uid(), jurisdictionCode: "PT", startDate: `${y}-03-05`, endDate: `${y}-05-20`, notes: "Lisbon" },
      { id: uid(), jurisdictionCode: "ES", startDate: `${y}-05-21`, endDate: `${y}-06-15` },
      { id: uid(), jurisdictionCode: "GB", startDate: `${y}-06-20`, endDate: `${y}-07-05` },
      { id: uid(), jurisdictionCode: "US-CA", startDate: `${y}-07-10`, endDate: `${y}-09-30`, notes: "SF work trip" },
      { id: uid(), jurisdictionCode: "MX", startDate: `${y}-10-05`, endDate: `${y}-11-15` },
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${y}-11-20`, endDate: `${y}-12-31` },
      { id: uid(), jurisdictionCode: "US-NY", startDate: `${y - 1}-03-01`, endDate: `${y - 1}-08-31` },
      { id: uid(), jurisdictionCode: "US-CA", startDate: `${y - 2}-06-01`, endDate: `${y - 2}-12-31` },
    ];
    if (
      trips.length === 0 ||
      confirm("Replace your current trips with sample data?")
    ) {
      setTrips(demo);
    }
  };

  const clearAll = () => {
    if (trips.length === 0) return;
    if (confirm("Delete ALL trips? This cannot be undone.")) setTrips([]);
  };

  if (!hydrated) {
    return (
      <div className="card p-8 text-center text-ink-400">
        Loading your trips…
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ------- LEFT: controls + add form + trip list ------- */}
      <div className="flex flex-col gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-300">Settings</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-400">
              Tax year
              <select
                value={settings.taxYear}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, taxYear: Number(e.target.value) }))
                }
                className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">
              Day-count mode
              <select
                value={settings.dayCountMode}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    dayCountMode: e.target.value as DayCountMode,
                  }))
                }
                className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              >
                <option value="inclusive">Count all days</option>
                <option value="exclude-travel">Exclude travel days</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Most tax authorities count any part of a day, so <b>Count all days</b>
            is the safe default.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-300">
            {editingTrip ? "Edit trip" : "Add a trip"}
          </h2>
          <AddTripForm
            key={editingTrip?.id ?? "new"}
            initial={editingTrip}
            onSubmit={upsertTrip}
            onCancel={editingTrip ? () => setEditingId(null) : undefined}
          />
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-300">
              Trips ({trips.length})
            </h2>
            <div className="flex gap-1">
              <button
                onClick={exportJSON}
                className="rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
                title="Export to JSON"
              >
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
                title="Import from JSON"
              >
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJSON(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {sortedTrips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-ink-400">
              No trips yet. Add your first one above,
              <br />
              or{" "}
              <button
                onClick={loadDemo}
                className="font-medium text-brand-400 hover:text-brand-300"
              >
                load sample data
              </button>{" "}
              to explore.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sortedTrips.map((t) => {
                const j = getJurisdiction(t.jurisdictionCode);
                return (
                  <li
                    key={t.id}
                    className={classNames(
                      "group flex items-center justify-between rounded-lg border border-transparent px-2.5 py-2 hover:border-white/10 hover:bg-white/5",
                      editingId === t.id && "border-brand-500/60 bg-brand-500/5",
                    )}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      onClick={() => setEditingId(t.id)}
                    >
                      <span className="text-lg leading-none">{j?.flag ?? "📍"}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-white">
                          {j?.name ?? t.jurisdictionCode}
                          <span className="ml-1.5 text-xs text-ink-400">
                            · {tripLength(t.startDate, t.endDate, settings.dayCountMode)}d
                          </span>
                        </span>
                        <span className="truncate text-xs text-ink-400">
                          {fmtRange(t.startDate, t.endDate)}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => removeTrip(t.id)}
                      aria-label="Delete trip"
                      className="ml-2 rounded-md p-1.5 text-ink-500 opacity-0 transition hover:bg-danger-500/15 hover:text-danger-400 group-hover:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {sortedTrips.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
              <button
                onClick={loadDemo}
                className="hover:text-ink-300"
                title="Replace trips with sample data"
              >
                Load sample data
              </button>
              <button
                onClick={clearAll}
                className="hover:text-danger-400"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------- RIGHT: summary + cards ------- */}
      <div className="flex flex-col gap-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-ink-400">
                Tax year {settings.taxYear} · as of {fmtDate(todayISO())}
              </p>
              <p className="mt-1 text-3xl font-semibold text-white">
                {totalDaysThisYear}{" "}
                <span className="text-base font-normal text-ink-400">
                  days logged this year
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-ink-500">
                Unlogged time
              </span>
              <span className="text-xl font-semibold text-ink-200">
                {Math.max(0, 365 - totalDaysThisYear)} days
              </span>
            </div>
          </div>
          {sortedTally.length === 0 ? (
            <p className="mt-6 text-sm text-ink-400">
              Add a trip on the left to see residency tallies appear here.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortedTally.map(
                (row) =>
                  row.jurisdiction && (
                    <JurisdictionCard
                      key={row.code}
                      jurisdiction={row.jurisdiction}
                      days={row.days}
                      status={row.status}
                    />
                  ),
              )}
            </div>
          )}
        </div>

        <SPTCard result={spt} />

        <div className="card p-6 text-sm text-ink-400">
          <h3 className="text-sm font-medium text-white">Assumptions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Day counts assume the calendar year (Jan 1 → Dec 31). Some jurisdictions use different tax years — verify your own.</li>
            <li>Overlapping trips are de-duplicated: the same day can't count twice, even across jurisdictions.</li>
            <li>The Substantial Presence Test sums days in the US plus any US state; treaty tie-breakers and visa exemptions are not applied.</li>
            <li>Several countries (UK, Canada, Germany, etc.) use tie/ties tests on top of day counts — always confirm with a tax professional.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function yearOptions(): number[] {
  const cur = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = cur + 1; y >= cur - 5; y--) years.push(y);
  return years;
}
