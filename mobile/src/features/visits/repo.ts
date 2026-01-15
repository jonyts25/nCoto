import type { Visit } from "./types";
import { loadVisits, saveVisits } from "./storage";

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listVisits(): Promise<Visit[]> {
  await syncExpiredVisits();
  const visits = await loadVisits();
  return visits.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}


export async function createVisit(input: {
  guestName: string;
  plates?: string;
  note?: string;
  validUntil: string; // ISO
}): Promise<Visit> {
  const visits = await loadVisits();
  const newVisit: Visit = {
    id: makeId(),
    guestName: input.guestName,
    plates: input.plates?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    validUntil: input.validUntil,
    status: "active",
  };
  visits.unshift(newVisit);
  await saveVisits(visits);
  return newVisit;
}

export async function clearAllVisits(): Promise<void> {
  await saveVisits([]);
}

export async function getVisitById(id: string): Promise<Visit | null> {
  const visits = await loadVisits();
  return visits.find(v => v.id === id) ?? null;
}

export async function markVisitUsed(id: string): Promise<void> {
  const visits = await loadVisits();
  const next = visits.map(v => (v.id === id ? { ...v, status: "used" as const } : v));
  await saveVisits(next);
}

export async function syncExpiredVisits(): Promise<void> {
  const visits = await loadVisits();
  const now = Date.now();

  let changed = false;
  const next = visits.map((v) => {
    if (v.status === "active") {
      const until = Date.parse(v.validUntil);
      if (!Number.isNaN(until) && until < now) {
        changed = true;
        return { ...v, status: "expired" as const };
      }
    }
    return v;
  });

  if (changed) {
    await saveVisits(next);
  }
}
