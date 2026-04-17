export type Trip = {
  id: string;
  jurisdictionCode: string;
  startDate: string;
  endDate: string;
  notes?: string;
};

export type Jurisdiction = {
  code: string;
  name: string;
  flag: string;
  group: "country" | "us-state";
  /** Primary day-based residency threshold, if a simple one exists. */
  threshold?: {
    days: number;
    /** Short, plain-language label such as "183-day rule". */
    label: string;
    /** Longer explanation. */
    description: string;
  };
  /** Extra notes that the UI can surface alongside the count. */
  notes?: string[];
};

export type DayCountMode = "inclusive" | "exclude-travel";

export type Settings = {
  taxYear: number;
  dayCountMode: DayCountMode;
};
