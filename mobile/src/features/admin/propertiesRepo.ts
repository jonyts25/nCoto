import { supabase } from "@/src/lib/supabase";
import { normalizeHouseKey } from "@/src/features/properties/formatHouseLabel";

export type AdminPropertyRow = {
  id: string;
  coto_id: string;
  house_number: string;
  is_delinquent: boolean;
  created_at: string;
};

/** Una tarjeta por casa; si hay filas duplicadas en BD, fusiona morosidad y conserva el id más antiguo. */
export function dedupePropertiesByHouse(rows: AdminPropertyRow[]): AdminPropertyRow[] {
  const byHouse = new Map<string, AdminPropertyRow>();

  for (const row of rows) {
    const key = normalizeHouseKey(row.house_number);
    const existing = byHouse.get(key);
    if (!existing) {
      byHouse.set(key, row);
      continue;
    }

    const keepExisting =
      existing.created_at <= row.created_at ? existing : row;
    const other = keepExisting === existing ? row : existing;

    byHouse.set(key, {
      ...keepExisting,
      house_number: keepExisting.house_number.trim() || other.house_number.trim(),
      is_delinquent: existing.is_delinquent || row.is_delinquent,
    });
  }

  return [...byHouse.values()].sort((a, b) =>
    a.house_number.localeCompare(b.house_number, "es", { numeric: true, sensitivity: "base" }),
  );
}

export async function fetchPropertiesForCoto(cotoId: string): Promise<AdminPropertyRow[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("id, coto_id, house_number, is_delinquent, created_at")
    .eq("coto_id", cotoId)
    .order("house_number", { ascending: true });

  if (error) {
    console.error("[admin properties]", error);
    return [];
  }
  return dedupePropertiesByHouse((data ?? []) as AdminPropertyRow[]);
}

export async function setPropertyDelinquent(
  propertyId: string,
  isDelinquent: boolean,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("properties")
    .update({ is_delinquent: isDelinquent })
    .eq("id", propertyId);
  if (error) return { error: error.message };
  return {};
}

/** Actualiza morosidad en todas las filas duplicadas de la misma casa dentro del coto. */
export async function setPropertyDelinquentByHouse(
  cotoId: string,
  houseNumber: string,
  isDelinquent: boolean,
): Promise<{ error?: string }> {
  const { data, error: fetchErr } = await supabase
    .from("properties")
    .select("id, house_number")
    .eq("coto_id", cotoId);

  if (fetchErr) return { error: fetchErr.message };

  const key = normalizeHouseKey(houseNumber);
  const ids = (data ?? [])
    .filter((row) => normalizeHouseKey(String(row.house_number)) === key)
    .map((row) => String(row.id));

  if (ids.length === 0) return { error: "Propiedad no encontrada." };

  const { error } = await supabase
    .from("properties")
    .update({ is_delinquent: isDelinquent })
    .in("id", ids);

  if (error) return { error: error.message };
  return {};
}
