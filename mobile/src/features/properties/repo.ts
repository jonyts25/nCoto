import { supabase } from "@/src/lib/supabase";

/** Fila `public.properties` tal como la expone Supabase (SELECT *). */
export type PropertyRow = Record<string, unknown> & {
  id: string;
  coto_id: string;
  house_number: string;
  display_label?: string | null;
  is_delinquent: boolean;
};

/**
 * Propiedad vinculada al perfil del usuario autenticado (`profiles.property_id`).
 * RLS: `properties_select_tenant` en el mismo coto.
 */
export async function fetchCurrentUserProperty(): Promise<PropertyRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: prof, error: pe } = await supabase
    .from("profiles")
    .select("property_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pe || !prof?.property_id) return null;

  const { data: prop, error: pr } = await supabase
    .from("properties")
    .select("*")
    .eq("id", prof.property_id as string)
    .maybeSingle();

  if (pr || !prop) return null;
  return prop as PropertyRow;
}
