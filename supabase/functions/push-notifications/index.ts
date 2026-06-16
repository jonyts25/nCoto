import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: "default";
  data?: Record<string, unknown>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get("PUSH_NOTIFICATIONS_WEBHOOK_SECRET")?.trim();
  if (!expected) {
    console.error("push-notifications: falta PUSH_NOTIFICATIONS_WEBHOOK_SECRET");
    return false;
  }
  const got = req.headers.get("x-ncoto-push-secret")?.trim();
  return got === expected;
}

async function sendExpoBatch(messages: ExpoPushMessage[]): Promise<{ ok: boolean; detail?: unknown }> {
  if (messages.length === 0) return { ok: true };
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 99) {
    chunks.push(messages.slice(i, i + 99));
  }
  for (const chunk of chunks) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, detail: body };
    }
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ncoto-push-secret",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!requireWebhookSecret(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  try {
    // Formato Database Webhook de Supabase
    const whTable = body.table as string | undefined;
    const whType = body.type as string | undefined;
    const whRecord = body.record as Record<string, unknown> | undefined;

    if (whTable === "announcements" && whType === "INSERT" && whRecord?.id) {
      return await handleAnnouncementByRow(admin, whRecord as AnnouncementRow);
    }
    if (whTable === "payment_submissions" && whType === "UPDATE" && whRecord?.id) {
      const st = whRecord.status as string | undefined;
      if (st === "approved" || st === "rejected") {
        return await handlePaymentById(admin, String(whRecord.id), st);
      }
      return jsonResponse({ skipped: true, reason: "status not terminal" });
    }

    // Formato compacto desde triggers SQL (pg_net)
    const kind = body.kind as string | undefined;
    if (kind === "announcement" && body.id) {
      const { data: row, error } = await admin.from("announcements").select("*").eq("id", body.id).maybeSingle();
      if (error) throw error;
      if (!row) return jsonResponse({ error: "announcement not found" }, 404);
      return await handleAnnouncementByRow(admin, row as unknown as AnnouncementRow);
    }
    if (kind === "payment_submission" && body.id && body.status) {
      return await handlePaymentById(admin, String(body.id), String(body.status));
    }

    return jsonResponse({ error: "Unrecognized payload" }, 400);
  } catch (e) {
    console.error("push-notifications:", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

type AnnouncementRow = {
  id: string;
  coto_id: string;
  title: string;
  body: string;
  audience: "all" | "residents" | "guards" | "admins" | "board_members";
};

type ProfileTokenRow = { expo_push_token: string };

type SupabaseAdmin = ReturnType<typeof createClient>;

async function handleAnnouncementByRow(
  admin: SupabaseAdmin,
  row: AnnouncementRow,
): Promise<Response> {
  let q = admin
    .from("profiles")
    .select("expo_push_token")
    .eq("coto_id", row.coto_id)
    .not("expo_push_token", "is", null);

  const aud = row.audience;
  if (aud === "residents") {
    q = q.eq("role", "resident");
  } else if (aud === "guards") {
    q = q.eq("role", "guard");
  } else if (aud === "admins") {
    q = q.in("role", ["admin", "coto_admin"]);
  } else if (aud === "board_members") {
    q = q.eq("role", "board_member");
  }
  // aud === 'all' → sin filtro de rol

  const { data: rows, error } = await q;
  if (error) throw error;

  const tokens = dedupeTokens((rows ?? []) as ProfileTokenRow[]);
  const bodyText = String(row.body ?? "");
  const preview = bodyText.length > 160 ? `${bodyText.slice(0, 157)}...` : bodyText;
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: row.title,
    body: preview,
    sound: "default",
    data: { type: "announcement", id: row.id, coto_id: row.coto_id },
  }));

  const sent = await sendExpoBatch(messages);
  if (!sent.ok) {
    return jsonResponse({ error: "Expo push failed", detail: sent.detail }, 502);
  }
  return jsonResponse({ ok: true, kind: "announcement", recipients: messages.length });
}

async function handlePaymentById(
  admin: SupabaseAdmin,
  id: string,
  status: string,
): Promise<Response> {
  if (status !== "approved" && status !== "rejected") {
    return jsonResponse({ skipped: true });
  }

  const { data: ps, error } = await admin
    .from("payment_submissions")
    .select("id, created_by, status, admin_notes")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!ps) return jsonResponse({ error: "payment_submission not found" }, 404);
  if (ps.status !== status) {
    return jsonResponse({ skipped: true, reason: "status mismatch" });
  }

  const uid = ps.created_by as string;
  const { data: prof, error: pe } = await admin
    .from("profiles")
    .select("expo_push_token")
    .eq("id", uid)
    .maybeSingle();

  if (pe) throw pe;
  const token = (prof as { expo_push_token: string | null } | null)?.expo_push_token;
  if (!token) {
    return jsonResponse({ ok: true, skipped: true, reason: "no expo_push_token" });
  }

  const title = status === "approved" ? "Pago aprobado" : "Comprobante no aprobado";
  const notes = (ps.admin_notes as string | null)?.trim();
  const body =
    status === "approved"
      ? "Tu comprobante de pago fue aprobado."
      : notes
        ? `Tu comprobante no fue aprobado. Motivo: ${notes.slice(0, 200)}`
        : "Tu comprobante no fue aprobado. Revisa la app para más detalle.";

  const sent = await sendExpoBatch([
    {
      to: token,
      title,
      body,
      sound: "default",
      data: { type: "payment_submission", id: ps.id, status },
    },
  ]);
  if (!sent.ok) {
    return jsonResponse({ error: "Expo push failed", detail: sent.detail }, 502);
  }
  return jsonResponse({ ok: true, kind: "payment_submission", recipients: 1 });
}

function dedupeTokens(rows: ProfileTokenRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const t = r.expo_push_token?.trim();
    if (t) set.add(t);
  }
  return [...set];
}
