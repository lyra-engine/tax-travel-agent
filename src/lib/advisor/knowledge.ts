import type { Source } from "./types";

/**
 * Hardcoded tax knowledge snippets used as a RAG stub.
 * Swap this for a real vector store when ready; the contract is the same
 * (query string → ranked list of Source objects).
 */

export type Doc = Source & {
  keywords: string[];
};

export const KNOWLEDGE: Doc[] = [
  {
    id: "kb-ira-limits-2024",
    title: "IRA contribution limits (2024)",
    url: "https://www.irs.gov/retirement-plans/retirement-topics-ira-contribution-limits",
    snippet:
      "For 2024, the IRA contribution limit is $7,000 ($8,000 if age 50+). Phase-outs apply for deductible traditional IRAs when covered by a workplace plan, and for Roth IRAs above MAGI thresholds (single: $146k–$161k; MFJ: $230k–$240k).",
    keywords: ["ira", "roth", "traditional", "contribution", "limit", "phase-out", "magi"],
  },
  {
    id: "kb-401k-limits-2024",
    title: "401(k) contribution limits (2024 / 2025)",
    url: "https://www.irs.gov/newsroom/401k-limit-increases-to-23500-for-2025",
    snippet:
      "2024 employee deferral limit is $23,000 ($30,500 with age-50 catch-up). 2025 rises to $23,500. SECURE 2.0 adds an enhanced catch-up of $11,250 for ages 60–63 starting 2025. Total annual addition (employer + employee) is $69,000 in 2024 / $70,000 in 2025.",
    keywords: ["401k", "401(k)", "deferral", "catch-up", "secure 2.0", "employer match", "limit"],
  },
  {
    id: "kb-ltcg-2024",
    title: "Long-term capital gains rates (2024)",
    url: "https://www.irs.gov/taxtopics/tc409",
    snippet:
      "0% bracket up to $47,025 single / $94,050 MFJ of taxable income; 15% up to $518,900 single / $583,750 MFJ; 20% above. A 3.8% Net Investment Income Tax applies over MAGI $200k single / $250k MFJ. Holding period must exceed one year.",
    keywords: ["ltcg", "long-term", "capital gains", "0%", "15%", "20%", "niit", "net investment"],
  },
  {
    id: "kb-wash-sale",
    title: "Wash-sale rule (IRC §1091)",
    url: "https://www.irs.gov/publications/p550",
    snippet:
      "A loss on the sale of a security is disallowed if a substantially identical security is purchased within 30 days before or after the sale (61-day window). The disallowed loss adds to the basis of the replacement shares. Applies across accounts, including IRAs.",
    keywords: ["wash sale", "disallowed loss", "substantially identical", "61 day", "basis"],
  },
  {
    id: "kb-salt-cap",
    title: "SALT deduction cap",
    url: "https://www.irs.gov/newsroom/tax-cuts-and-jobs-act-a-comparison-for-large-businesses-and-international-taxpayers",
    snippet:
      "Itemized deduction for state and local taxes (SALT) is capped at $10,000 per year ($5,000 MFS) through 2025 under TCJA. Many states offer Pass-Through Entity (PTE) tax elections that effectively work around the cap for business owners.",
    keywords: ["salt", "state and local", "cap", "10000", "pte", "pass-through", "tcja", "itemized"],
  },
  {
    id: "kb-estate-exemption",
    title: "Estate & gift tax exemption (2024 / 2025)",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/estate-tax",
    snippet:
      "2024 unified federal estate & gift tax exemption is $13.61M per individual ($27.22M per couple with portability). 2025 rises to $13.99M. Sunsets to approximately half at end of 2025 unless extended. Annual gift exclusion: $18k (2024) / $19k (2025).",
    keywords: ["estate", "gift", "exemption", "portability", "sunset", "tcja", "annual exclusion"],
  },
  {
    id: "kb-feie-2024",
    title: "Foreign Earned Income Exclusion (§911)",
    url: "https://www.irs.gov/individuals/international-taxpayers/foreign-earned-income-exclusion",
    snippet:
      "US citizens and resident aliens working abroad may exclude up to $126,500 (2024) / $130,000 (2025) of foreign earned income via Form 2555, provided they meet either the Bona Fide Residence Test or the Physical Presence Test (330 full days in a 12-month period).",
    keywords: ["feie", "foreign earned income", "exclusion", "section 911", "bona fide", "physical presence", "330 days", "expat"],
  },
  {
    id: "kb-spt",
    title: "Substantial Presence Test (US residency)",
    url: "https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test",
    snippet:
      "A non-citizen is a US resident for tax purposes under the Substantial Presence Test if they are in the US at least 31 days in the current year AND the weighted sum (days current + ⅓ of prior year + ⅙ of two years prior) is ≥ 183. Exempt individuals (students, teachers on F/J/M/Q visas) may not count days.",
    keywords: ["spt", "substantial presence", "residency", "183", "31 day", "expat", "f-1", "j-1"],
  },
  {
    id: "kb-rmd",
    title: "Required Minimum Distributions (RMDs)",
    url: "https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs",
    snippet:
      "Under SECURE 2.0 Act, RMD age is 73 (born 1951–1959) and 75 (born 1960+). First RMD may be deferred to April 1 of the year after turning the RMD age; subsequent RMDs due by Dec 31. Penalty for missed RMDs reduced to 25% (10% if corrected timely). Roth 401(k)s no longer require RMDs starting 2024.",
    keywords: ["rmd", "required minimum distribution", "secure 2.0", "age 73", "age 75", "roth 401k"],
  },
  {
    id: "kb-qcd",
    title: "Qualified Charitable Distribution (QCD)",
    url: "https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras-distributions-withdrawals",
    snippet:
      "IRA owners 70½ and older may direct up to $105,000 (2024) / $108,000 (2025) per year from a traditional IRA to qualified charities as a Qualified Charitable Distribution. The QCD counts toward RMDs and is excluded from AGI — often better than itemizing.",
    keywords: ["qcd", "charitable", "ira", "70.5", "rmd", "donation", "agi"],
  },
  {
    id: "kb-backdoor-roth",
    title: "Backdoor Roth IRA strategy",
    url: "https://www.irs.gov/retirement-plans/traditional-and-roth-iras",
    snippet:
      "For high earners above Roth income limits: contribute non-deductible to a traditional IRA, then convert to Roth. Pro-rata rule (§408(d)(2)) aggregates all pre-tax IRA balances, potentially making the conversion mostly taxable. Mega backdoor Roth via after-tax 401(k) contributions + in-plan conversions can add ~$46k/year.",
    keywords: ["backdoor roth", "mega backdoor", "pro-rata", "after-tax", "conversion", "408(d)"],
  },
  {
    id: "kb-nii-tax",
    title: "Net Investment Income Tax (NIIT)",
    url: "https://www.irs.gov/individuals/net-investment-income-tax",
    snippet:
      "3.8% additional tax on the lesser of net investment income or MAGI over $200k (single) / $250k (MFJ) / $125k (MFS). Investment income includes dividends, interest, capital gains, rental (unless real estate professional), passive business income.",
    keywords: ["niit", "net investment income", "3.8%", "surtax", "magi", "passive"],
  },
  {
    id: "kb-qbi",
    title: "QBI deduction (§199A)",
    url: "https://www.irs.gov/newsroom/qualified-business-income-deduction",
    snippet:
      "Up to 20% deduction on qualified business income from pass-throughs. 2024 phase-in thresholds: $241,950 single / $483,900 MFJ. Above phase-out, SSTBs (consulting, health, law, etc.) lose the deduction entirely; non-SSTBs face W-2 wage and UBIA limitations. Sunsets end of 2025.",
    keywords: ["qbi", "199a", "pass-through", "sstb", "20%", "sunset", "wage limit", "ubia"],
  },
  {
    id: "kb-state-residency-ny",
    title: "New York statutory residency",
    url: "https://www.tax.ny.gov/pit/file/pit_definitions.htm",
    snippet:
      "NY treats an individual as a statutory resident if they (1) maintain a permanent place of abode in NY for substantially all of the year AND (2) spend more than 183 days in-state. Any part of a day counts. Statutory residents are taxed on worldwide income.",
    keywords: ["new york", "ny", "statutory resident", "183 days", "permanent place of abode", "ppa"],
  },
  {
    id: "kb-state-residency-ca",
    title: "California residency — closest connection",
    url: "https://www.ftb.ca.gov/file/personal/residency-status/",
    snippet:
      "California uses a facts-and-circumstances 'closest connection' test. FTB Pub 1031 provides a safe harbor for employment contracts of 546+ days. Absent safe harbor, CA weighs home, family, time, business presence, and registrations. Six-month presumption: 6+ months temporary in CA is presumed non-resident if all ties elsewhere.",
    keywords: ["california", "ca", "ftb", "closest connection", "safe harbor", "1031", "546 days"],
  },
];

export function searchKnowledge(query: string, k = 4): Source[] {
  const q = query.toLowerCase();
  const tokens = q.split(/\W+/).filter((t) => t.length > 2);
  const scored = KNOWLEDGE.map((d) => {
    let score = 0;
    for (const kw of d.keywords) {
      if (q.includes(kw.toLowerCase())) score += 3;
    }
    for (const t of tokens) {
      if (d.title.toLowerCase().includes(t)) score += 2;
      if (d.snippet.toLowerCase().includes(t)) score += 1;
    }
    return { d, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored.map(({ d }) => ({
    id: d.id,
    title: d.title,
    url: d.url,
    snippet: d.snippet,
  }));
}
