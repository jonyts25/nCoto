import { supabase } from "@/src/lib/supabase";
import type { UserAppRole } from "@/src/features/visits/types";

export type ProfileRow = {
  id: string;
  role: UserAppRole;
  display_name: string | null;
  coto_id: string;
  created_at: string;
};

export type CotoListRow = { id: string; name: string; slug: string | null };

/** Slug de Edge Function; coincide con `supabase/functions/<slug>/`. */
function adminCreateUserSlug(): string {
  return (process.env.EXPO_PUBLIC_EDGE_FN_ADMIN_CREATE_USER || "admin-create-user").replace(/^\/+|\/+$/g, "");
}

/** Listado de perfiles del tenant efectivo (RLS). */
export async function listProfilesForCurrentCoto(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, coto_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function listAllCotos(): Promise<CotoListRow[]> {
  const { data, error } = await supabase.from("cotos").select("id, name, slug").order("name");
  if (error) throw error;
  return (data ?? []) as CotoListRow[];
}

/** Roles que un admin de coto o superadmin puede asignar desde el chip rápido. */
export async function updateUserRole(userId: string, role: "resident" | "guard" | "board_member"): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw error;
}

export type CreateUserPayload = {
  email: string;
  display_name?: string;
  role: UserAppRole;
  coto_id: string;
  password?: string;
};

/**
 * Alta de usuario vía Edge Function (service role en servidor; no exponer clave en el cliente).
 */
export async function createUserViaEdgeFunction(payload: CreateUserPayload): Promise<{ user_id: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesión requerida.");

  const slug = adminCreateUserSlug();
  const { data, error } = await supabase.functions.invoke<{ user_id?: string; error?: string }>(slug, {
    body: payload,
  });

  if (error) {
    const msg = error.message || String(error);
    throw new Error(
      msg.includes("404") || /not\s*found/i.test(msg)
        ? `Edge Function no encontrada (${slug}). Despliega la función en Supabase o define EXPO_PUBLIC_EDGE_FN_ADMIN_CREATE_USER si usas otro nombre.`
        : msg
    );
  }

  const body = data as { user_id?: string; error?: string } | null;
  if (body?.error) throw new Error(body.error);
  if (!body?.user_id) throw new Error("Respuesta inválida del servidor (sin user_id).");
  return { user_id: body.user_id };
}
