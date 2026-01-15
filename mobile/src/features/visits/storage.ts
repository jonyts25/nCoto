import * as SecureStore from "expo-secure-store";
import type { Visit } from "./types";

const KEY = "ncoto_visits_v1";

export async function loadVisits(): Promise<Visit[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Visit[];
  } catch {
    return [];
  }
}

export async function saveVisits(visits: Visit[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(visits));
}
