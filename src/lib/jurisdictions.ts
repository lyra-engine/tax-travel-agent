import type { Jurisdiction } from "./types";

const d183 = {
  days: 183,
  label: "183-day rule",
  description:
    "Spending 183 days or more in a calendar year typically creates tax residency under this jurisdiction's domestic law. Treaty tie-breaker rules may still apply.",
};

export const JURISDICTIONS: Jurisdiction[] = [
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    group: "country",
    threshold: {
      days: 183,
      label: "Substantial Presence Test",
      description:
        "US residency is determined by the Substantial Presence Test: days in the current year + 1/3 of days in the prior year + 1/6 of days two years prior ≥ 183, with ≥ 31 days in the current year.",
    },
    notes: [
      "Green card holders are tax residents regardless of days.",
      "Certain visa categories (F, J, M, Q) can be exempt — not modeled here.",
    ],
  },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", group: "country", threshold: d183, notes: ["UK uses a Statutory Residence Test with day thresholds that vary based on ties (16/46/91/183). This tool shows raw days only."] },
  { code: "CA", name: "Canada", flag: "🇨🇦", group: "country", threshold: d183, notes: ["Canada also considers residential ties, not just days."] },
  { code: "AU", name: "Australia", flag: "🇦🇺", group: "country", threshold: d183 },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", group: "country", threshold: { days: 183, label: "183-day rule", description: "Present in NZ for more than 183 days in any 12-month period triggers residency." } },
  { code: "DE", name: "Germany", flag: "🇩🇪", group: "country", threshold: d183, notes: ["Germany also uses a 'habitual abode' test — continuous stays over 6 months create residency."] },
  { code: "FR", name: "France", flag: "🇫🇷", group: "country", threshold: d183 },
  { code: "ES", name: "Spain", flag: "🇪🇸", group: "country", threshold: d183, notes: ["Spain counts 'sporadic absences' toward the 183-day total unless you prove tax residency elsewhere."] },
  { code: "PT", name: "Portugal", flag: "🇵🇹", group: "country", threshold: d183, notes: ["Having a habitual residence in Portugal on Dec 31 also creates residency."] },
  { code: "IT", name: "Italy", flag: "🇮🇹", group: "country", threshold: d183 },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", group: "country", threshold: d183 },
  { code: "IE", name: "Ireland", flag: "🇮🇪", group: "country", threshold: { days: 183, label: "183 / 280-day rule", description: "Ireland: 183 days in a tax year OR 280 days across two consecutive years creates residency." } },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", group: "country", threshold: { days: 90, label: "30 / 90-day rule", description: "30 days gainful activity, or 90 days without gainful activity, creates Swiss residency." } },
  { code: "SG", name: "Singapore", flag: "🇸🇬", group: "country", threshold: d183 },
  { code: "JP", name: "Japan", flag: "🇯🇵", group: "country", threshold: d183 },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", group: "country", threshold: { days: 183, label: "183-day rule", description: "UAE tax residency (for certificate purposes) generally requires 183 days of presence." } },
  { code: "MX", name: "Mexico", flag: "🇲🇽", group: "country" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", group: "country", threshold: { days: 183, label: "183-day rule", description: "Non-residents become Brazilian tax residents after 183 days in a 12-month period." } },
  { code: "TH", name: "Thailand", flag: "🇹🇭", group: "country", threshold: d183 },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", group: "country", threshold: d183 },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", group: "country", threshold: d183 },

  { code: "US-CA", name: "California", flag: "🇺🇸", group: "us-state", threshold: { days: 183, label: "California 9-factor / day test", description: "California uses a facts-and-circumstances closest-connection test. Spending 9+ months creates a presumption of residency; 6+ months may be safe for non-residents. Track days carefully." } },
  { code: "US-NY", name: "New York", flag: "🇺🇸", group: "us-state", threshold: { days: 183, label: "NY 183-day statutory test", description: "NY treats you as a statutory resident if you maintain a permanent place of abode AND spend more than 183 days in-state. Any part of a day counts." } },
  { code: "US-TX", name: "Texas", flag: "🇺🇸", group: "us-state", notes: ["Texas has no state income tax."] },
  { code: "US-FL", name: "Florida", flag: "🇺🇸", group: "us-state", notes: ["Florida has no state income tax."] },
  { code: "US-WA", name: "Washington", flag: "🇺🇸", group: "us-state", notes: ["Washington has no general state income tax (but has a capital-gains tax)."] },
  { code: "US-IL", name: "Illinois", flag: "🇺🇸", group: "us-state", threshold: d183 },
  { code: "US-MA", name: "Massachusetts", flag: "🇺🇸", group: "us-state", threshold: d183, notes: ["MA applies a 183-day statutory residence test if you maintain a permanent place of abode."] },
  { code: "US-NJ", name: "New Jersey", flag: "🇺🇸", group: "us-state", threshold: d183 },
];

export const JURISDICTION_MAP: Record<string, Jurisdiction> = Object.fromEntries(
  JURISDICTIONS.map((j) => [j.code, j]),
);

export function getJurisdiction(code: string): Jurisdiction | undefined {
  return JURISDICTION_MAP[code];
}
