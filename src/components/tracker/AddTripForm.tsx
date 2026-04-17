import { useMemo, useState } from "react";
import type { Trip } from "../../lib/types";
import { JURISDICTIONS } from "../../lib/jurisdictions";
import { todayISO } from "../../lib/calc";
import { uid } from "../../lib/storage";

type Props = {
  initial?: Trip;
  onSubmit: (trip: Trip) => void;
  onCancel?: () => void;
};

export default function AddTripForm({ initial, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState(initial?.jurisdictionCode ?? "US");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(initial?.endDate ?? todayISO());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(() => {
    const countries = JURISDICTIONS.filter((j) => j.group === "country");
    const states = JURISDICTIONS.filter((j) => j.group === "us-state");
    return { countries, states };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setErr("Pick start and end dates.");
      return;
    }
    if (endDate < startDate) {
      setErr("End date can't be before start date.");
      return;
    }
    setErr(null);
    onSubmit({
      id: initial?.id ?? uid(),
      jurisdictionCode: code,
      startDate,
      endDate,
      notes: notes.trim() || undefined,
    });
    if (!initial) {
      setNotes("");
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Jurisdiction
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <optgroup label="Countries">
            {options.countries.map((j) => (
              <option key={j.code} value={j.code}>
                {j.flag} {j.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="US states">
            {options.states.map((j) => (
              <option key={j.code} value={j.code}>
                {j.flag} {j.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Arrive
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Depart
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Notes (optional)
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Client visit, family, conference…"
          className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        />
      </label>

      {err && (
        <p className="rounded-md bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
          {err}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400"
        >
          {initial ? "Save changes" : "Add trip"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
