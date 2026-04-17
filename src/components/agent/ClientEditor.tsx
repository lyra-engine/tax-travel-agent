import { useState } from "react";
import type { Client, FilingStatus } from "../../lib/advisor/types";
import { FILING_STATUS_LABEL } from "../../lib/advisor/types";
import { createClient } from "../../lib/advisor/store";

type Props = {
  initial?: Client;
  onSave: (client: Client) => void;
  onCancel: () => void;
};

export default function ClientEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(initial?.filingStatus ?? "single");
  const [state, setState] = useState(initial?.state ?? "");
  const [age, setAge] = useState<string>(initial?.age?.toString() ?? "");
  const [dependents, setDependents] = useState<string>(initial?.dependents?.toString() ?? "");
  const [wages, setWages] = useState<string>(initial?.income?.wages?.toString() ?? "");
  const [selfEmployment, setSelfEmployment] = useState<string>(
    initial?.income?.selfEmployment?.toString() ?? "",
  );
  const [investment, setInvestment] = useState<string>(
    initial?.income?.investment?.toString() ?? "",
  );
  const [rental, setRental] = useState<string>(initial?.income?.rental?.toString() ?? "");
  const [trad401k, setTrad401k] = useState<string>(
    initial?.retirement?.traditional401k?.toString() ?? "",
  );
  const [rothIra, setRothIra] = useState<string>(
    initial?.retirement?.rothIra?.toString() ?? "",
  );
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  const num = (s: string): number | undefined => {
    if (s.trim() === "") return undefined;
    const v = Number(s.replace(/,/g, ""));
    return Number.isFinite(v) ? v : undefined;
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    const base =
      initial ??
      createClient({ name: name.trim(), filingStatus });
    const updated: Client = {
      ...base,
      name: name.trim(),
      email: email.trim() || undefined,
      filingStatus,
      state: state.trim() || undefined,
      age: num(age),
      dependents: num(dependents),
      income: {
        wages: num(wages),
        selfEmployment: num(selfEmployment),
        investment: num(investment),
        rental: num(rental),
      },
      retirement: {
        traditional401k: num(trad401k),
        rothIra: num(rothIra),
      },
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
      updatedAt: Date.now(),
    };
    onSave(updated);
  };

  return (
    <form onSubmit={save} className="card flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {initial ? `Edit ${initial.name}` : "New client"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-ink-400 hover:bg-white/5 hover:text-white"
        >
          Cancel
        </button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input()}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input()}
          />
        </Field>
        <Field label="Filing status">
          <select
            value={filingStatus}
            onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
            className={input()}
          >
            {(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((fs) => (
              <option key={fs} value={fs}>
                {FILING_STATUS_LABEL[fs]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="State (abbr.)">
          <input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            placeholder="NY"
            maxLength={2}
            className={input()}
          />
        </Field>
        <Field label="Age">
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={input()}
          />
        </Field>
        <Field label="Dependents">
          <input
            type="number"
            value={dependents}
            onChange={(e) => setDependents(e.target.value)}
            className={input()}
          />
        </Field>
      </fieldset>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">Income (annual, $)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Wages (W-2)">
            <input
              inputMode="numeric"
              value={wages}
              onChange={(e) => setWages(e.target.value)}
              className={input()}
            />
          </Field>
          <Field label="Self-employment">
            <input
              inputMode="numeric"
              value={selfEmployment}
              onChange={(e) => setSelfEmployment(e.target.value)}
              className={input()}
            />
          </Field>
          <Field label="Investment">
            <input
              inputMode="numeric"
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              className={input()}
            />
          </Field>
          <Field label="Rental">
            <input
              inputMode="numeric"
              value={rental}
              onChange={(e) => setRental(e.target.value)}
              className={input()}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">
          Retirement contributions YTD ($)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Traditional 401(k)">
            <input
              inputMode="numeric"
              value={trad401k}
              onChange={(e) => setTrad401k(e.target.value)}
              className={input()}
            />
          </Field>
          <Field label="Roth IRA">
            <input
              inputMode="numeric"
              value={rothIra}
              onChange={(e) => setRothIra(e.target.value)}
              className={input()}
            />
          </Field>
        </div>
      </div>

      <Field label="Tags (comma-separated)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="high-earner, cross-border"
          className={input()}
        />
      </Field>

      <Field label="Notes">
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={input() + " font-sans"}
        />
      </Field>

      {err && <p className="rounded-md bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{err}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/20 hover:bg-brand-400"
        >
          {initial ? "Save changes" : "Create client"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-400">
      {label}
      {children}
    </label>
  );
}

function input() {
  return "rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500";
}
