import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  email: string;
  display_name?: string;
  role: "resident" | "guard" | "admin" | "coto_admin" | "board_member";
  coto_id: string;
  password?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const jwtClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await jwtClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = (await req.json()) as Body;
    const { email, display_name, role, coto_id, password } = body;
    if (!email?.trim() || !coto_id || !role) {
      return json({ error: "email, coto_id y role son obligatorios" }, 400);
    }

    const { data: caller, error: pe } = await admin
      .from("profiles")
      .select("role, coto_id")
      .eq("id", user.id)
      .single();

    if (pe || !caller) {
      return json({ error: "Perfil no encontrado" }, 403);
    }

    const cr = caller.role as string;
    const homeCoto = caller.coto_id as string;

    let allowed = false;
    if (cr === "admin") {
      allowed = ["resident", "guard", "admin", "coto_admin", "board_member"].includes(role);
    } else if (cr === "coto_admin") {
      allowed = ["resident", "guard", "board_member"].includes(role) && coto_id === homeCoto;
    } else if (cr === "resident") {
      allowed = role === "resident" && coto_id === homeCoto;
    }

    if (!allowed) {
      return json({ error: "No tienes permiso para crear este usuario" }, 403);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      email_confirm: true,
      ...(password ? { password } : {}),
      user_metadata: { display_name: display_name ?? "" },
    });

    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "No se pudo crear el usuario" }, 400);
    }

    const newId = created.user.id;

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        coto_id,
        role,
        display_name: display_name?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", newId);

    if (upErr) {
      await admin.auth.admin.deleteUser(newId);
      return json({ error: upErr.message }, 500);
    }

    return json({ user_id: newId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
