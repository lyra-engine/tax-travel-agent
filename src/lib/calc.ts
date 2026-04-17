import type { DayCountMode, Trip } from "./types";

const MS_PER_DAY = 86_400_000;

function parseUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function toISO(ts: number): string {
  const dt = new Date(ts);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISO(Date.now());
}

export function addDays(iso: string, days: number): string {
  return toISO(parseUTC(iso) + days * MS_PER_DAY);
}

export function daysBetween(startISO: string, endISO: string): number {
  return Math.round((parseUTC(endISO) - parseUTC(startISO)) / MS_PER_DAY);
}

/** Inclusive year bounds as ISO strings. */
export function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * Compute the set of in-jurisdiction days for a given trip that fall within
 * [rangeStart, rangeEnd] (inclusive).
 * Returns a Set of ISO date strings so overlapping trips don't double-count.
 */
export function tripDaysInRange(
  trip: Trip,
  rangeStart: string,
  rangeEnd: string,
  mode: DayCountMode,
): Set<string> {
  const days = new Set<string>();
  const tripStart = parseUTC(trip.startDate);
  const tripEnd = parseUTC(trip.endDate);
  if (tripEnd < tripStart) return days;

  const rStart = parseUTC(rangeStart);
  const rEnd = parseUTC(rangeEnd);

  let from = Math.max(tripStart, rStart);
  let to = Math.min(tripEnd, rEnd);
  if (from > to) return days;

  if (mode === "exclude-travel" && tripEnd !== tripStart) {
    // Exclude the arrival and departure day.
    if (from === tripStart) from += MS_PER_DAY;
    if (to === tripEnd) to -= MS_PER_DAY;
  }

  for (let t = from; t <= to; t += MS_PER_DAY) {
    days.add(toISO(t));
  }
  return days;
}

export type JurisdictionTally = {
  code: string;
  days: number;
  dateSet: Set<string>;
};

export function tallyByJurisdiction(
  trips: Trip[],
  taxYear: number,
  mode: DayCountMode,
): Map<string, JurisdictionTally> {
  const { start, end } = yearBounds(taxYear);
  const out = new Map<string, JurisdictionTally>();
  for (const trip of trips) {
    const days = tripDaysInRange(trip, start, end, mode);
    if (days.size === 0) continue;
    const cur =
      out.get(trip.jurisdictionCode) ??
      { code: trip.jurisdictionCode, days: 0, dateSet: new Set<string>() };
    for (const d of days) cur.dateSet.add(d);
    cur.days = cur.dateSet.size;
    out.set(trip.jurisdictionCode, cur);
  }
  return out;
}

export function daysInYear(trips: Trip[], jurisdictionCode: string, year: number, mode: DayCountMode): number {
  const { start, end } = yearBounds(year);
  const set = new Set<string>();
  for (const t of trips) {
    if (t.jurisdictionCode !== jurisdictionCode) continue;
    for (const d of tripDaysInRange(t, start, end, mode)) set.add(d);
  }
  return set.size;
}

/**
 * US Substantial Presence Test.
 * Counts days for any jurisdiction code that belongs to the US
 * (i.e. "US" itself or any "US-XX" state code — because being in a US state
 * still counts as US presence for federal purposes).
 */
export type SPTResult = {
  currentYear: number;
  daysCurrent: number;
  daysPriorRaw: number;
  daysTwoPriorRaw: number;
  weightedTotal: number;
  meetsTest: boolean;
  meets31DayMin: boolean;
  thresholdReachedOn?: string;
};

function isUSCode(code: string): boolean {
  return code === "US" || code.startsWith("US-");
}

function usPresenceDates(trips: Trip[], year: number, mode: DayCountMode): Set<string> {
  const { start, end } = yearBounds(year);
  const set = new Set<string>();
  for (const t of trips) {
    if (!isUSCode(t.jurisdictionCode)) continue;
    for (const d of tripDaysInRange(t, start, end, mode)) set.add(d);
  }
  return set;
}

export function substantialPresenceTest(
  trips: Trip[],
  year: number,
  mode: DayCountMode,
): SPTResult {
  const current = usPresenceDates(trips, year, mode);
  const prior = usPresenceDates(trips, year - 1, mode);
  const twoPrior = usPresenceDates(trips, year - 2, mode);

  const daysCurrent = current.size;
  const daysPriorRaw = prior.size;
  const daysTwoPriorRaw = twoPrior.size;

  const weightedTotal =
    daysCurrent + daysPriorRaw / 3 + daysTwoPriorRaw / 6;

  const priorContribution = daysPriorRaw / 3 + daysTwoPriorRaw / 6;

  // When did the running total first cross 183? Walk sorted current-year days.
  let thresholdReachedOn: string | undefined;
  const sorted = [...current].sort();
  let running = priorContribution;
  for (const iso of sorted) {
    running += 1;
    if (running >= 183) {
      thresholdReachedOn = iso;
      break;
    }
  }

  return {
    currentYear: year,
    daysCurrent,
    daysPriorRaw,
    daysTwoPriorRaw,
    weightedTotal,
    meetsTest: weightedTotal >= 183 && daysCurrent >= 31,
    meets31DayMin: daysCurrent >= 31,
    thresholdReachedOn,
  };
}

export type ThresholdStatus = {
  days: number;
  thresholdDays?: number;
  remaining?: number;
  /** 0..1 progress toward the threshold. */
  progress?: number;
  level: "safe" | "warn" | "over";
};

export function statusForThreshold(days: number, thresholdDays?: number): ThresholdStatus {
  if (thresholdDays == null) {
    return { days, level: "safe" };
  }
  const remaining = Math.max(0, thresholdDays - days);
  const progress = Math.min(1, days / thresholdDays);
  let level: ThresholdStatus["level"] = "safe";
  if (days >= thresholdDays) level = "over";
  else if (progress >= 0.75) level = "warn";
  return { days, thresholdDays, remaining, progress, level };
}

/** Pretty formatters */
export function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fmtRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return fmtDate(startISO);
  return `${fmtDate(startISO)} → ${fmtDate(endISO)}`;
}

export function tripLength(startISO: string, endISO: string, mode: DayCountMode = "inclusive"): number {
  const n = daysBetween(startISO, endISO) + 1;
  if (mode === "exclude-travel" && n >= 2) return n - 2;
  return Math.max(0, n);
}
