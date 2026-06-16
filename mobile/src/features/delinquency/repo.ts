import { supabase } from "@/src/lib/supabase";

/**
 * Morosidad de la unidad vinculada al perfil del usuario autenticado.
 * Debe coincidir con `public.current_user_property_is_delinquent()` en Supabase (RLS visits).
 */
export async function fetchCurrentUserPropertyIsDelinquent(): Promise<boolean> {
  const { data, error } = await supabase.rpc("current_user_property_is_delinquent");

  if (error) {
    console.warn("current_user_property_is_delinquent RPC:", error.message);
    return false;
  }

  return Boolean(data);
}
