import { loadTrips } from "../storage";
import { loadClients, saveClients } from "./store";

/**
 * Copies the global residency journal (same storage as /tracker) onto a client
 * record so /api/chat and `residency_check` see those trips.
 */
export function copyWorkspaceJournalToClient(clientId: string): {
  ok: true;
  tripCount: number;
  clientName: string;
} | {
  ok: false;
  message: string;
} {
  const trips = loadTrips();
  const clients = loadClients();
  const idx = clients.findIndex((c) => c.id === clientId);
  if (idx === -1) {
    return { ok: false, message: "That client no longer exists. Refresh and try again." };
  }
  const snapshot = trips.map((t) => ({ ...t }));
  const next = [...clients];
  const prev = next[idx];
  next[idx] = { ...prev, trips: snapshot, updatedAt: Date.now() };
  saveClients(next);
  return { ok: true, tripCount: snapshot.length, clientName: prev.name };
}

export function workspaceJournalTripCount(): number {
  return loadTrips().length;
}
