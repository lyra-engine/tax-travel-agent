import type { Settings, Trip } from "./types";

const TRIPS_KEY = "ttagent.trips.v1";
const SETTINGS_KEY = "ttagent.settings.v1";

export function loadTrips(): Trip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export function loadSettings(): Settings {
  const defaults: Settings = {
    taxYear: new Date().getUTCFullYear(),
    dayCountMode: "inclusive",
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
