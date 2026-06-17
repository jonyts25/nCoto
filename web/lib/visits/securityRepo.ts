import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PeekVisitAccessAction,
  RegisterVisitAccessResult,
  Visit,
  VisitAccessAction,
  VisitKind,
  VisitPresence,
  VisitUsageMode,
  WeeklySlot,
} from "./types";
import {
  isVisitListedForToday,
  normalizeTimeHm,
  normalizeValidDayString,
  parseWeeklySchedule,
  visitSortTimeMinutes,
} from "./validation";

function mapVisitFromDB(row: Record<string, unknown>): Visit {
  const rawSchedule = row.schedule;
  let schedule: WeeklySlot[] | undefined;
  if (rawSchedule) {
    const parsed = parseWeeklySchedule(rawSchedule);
    schedule = parsed ?? undefined;
  }
  return {
    id: String(row.id),
    residentId: String(row.resident_id ?? ""),
    guestName: String(row.guest_name ?? ""),
    plates: row.plates != null ? String(row.plates) : undefined,
    note: row.note != null ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ""),
    validUntil: String(row.valid_until ?? ""),
    status: row.status as Visit["status"],
    visitType: (row.visit_type as VisitKind) ?? "eventual",
    schedule,
    validDay: normalizeValidDayString(row.valid_day),
    startTime: normalizeTimeHm(row.start_time),
    endTime: normalizeTimeHm(row.end_time),
    ingresoConfirmadoAt:
      row.ingreso_confirmado_at != null ? String(row.ingreso_confirmado_at) : undefined,
    lastAccessAt: row.last_access_at != null ? String(row.last_access_at) : undefined,
    usageMode:
      row.usage_mode != null ? (String(row.usage_mode) as VisitUsageMode) : undefined,
    presence:
      row.presence != null ? (String(row.presence) as VisitPresence) : row.presence === null ? null : undefined,
  };
}

export function mapAccessReasonToMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "mora":
      return "Unidad en mora";
    case "pase_vencido":
      return "Pase vencido";
    case "fuera_de_dia":
      return "Pase no válido para hoy";
    case "fuera_de_horario":
      return "Fuera de horario";
    case "fuera_de_schedule":
      return "Fuera del horario frecuente";
    case "inactive":
      return "Pase inactivo";
    case "sin_permiso":
      return "Sin permiso";
    default:
      return "No se puede registrar el acceso en este momento.";
  }
}

function mapPeekFromRpc(data: unknown): PeekVisitAccessAction | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const action = String(o.action ?? "blocked") as VisitAccessAction;
  const usageMode = (o.usage_mode != null ? String(o.usage_mode) : "single_use") as VisitUsageMode;
  const presenceRaw = o.presence;
  const presence =
    presenceRaw === "outside" || presenceRaw === "inside"
      ? (presenceRaw as VisitPresence)
      : presenceRaw == null
        ? null
        : null;
  return {
    action,
    usageMode,
    presence,
    canRegister: Boolean(o.can_register),
    reason: o.reason != null ? String(o.reason) : null,
    isDelinquent: Boolean(o.is_delinquent),
  };
}

export async function peekVisitAccessAction(
  supabase: SupabaseClient,
  visitId: string
): Promise<{ peek: PeekVisitAccessAction | null; error?: string }> {
  const { data, error } = await supabase.rpc("peek_visit_access_action", {
    p_visit_id: visitId,
  });

  if (error) {
    return { peek: null, error: error.message };
  }

  const peek = mapPeekFromRpc(data);
  if (!peek) {
    return { peek: null, error: "Respuesta inválida del servidor." };
  }
  return { peek };
}

export async function registerVisitAccess(
  supabase: SupabaseClient,
  visitId: string,
  plates?: string | null,
  note?: string | null
): Promise<RegisterVisitAccessResult> {
  const { data, error } = await supabase.rpc("register_visit_access", {
    p_visit_id: visitId,
    p_plates: plates?.trim() || null,
    p_note: note?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Respuesta inválida al registrar acceso.");
  }

  const o = data as Record<string, unknown>;
  const action = String(o.action ?? "entry");
  if (action !== "entry" && action !== "exit") {
    throw new Error("Acción de acceso no reconocida.");
  }

  const presenceRaw = o.presence;
  const presence =
    presenceRaw === "outside" || presenceRaw === "inside" ? (presenceRaw as VisitPresence) : null;

  return {
    ok: Boolean(o.ok ?? true),
    action,
    presence,
    visitId: String(o.visit_id ?? visitId),
  };
}

export type SecurityVisitLoadResult =
  | { kind: "ok"; visit: Visit }
  | { kind: "not_found" }
  | { kind: "rls_denied" }
  | { kind: "rpc_unavailable" }
  | { kind: "error"; message: string };

export async function loadVisitForSecurityScreen(
  supabase: SupabaseClient,
  id: string
): Promise<SecurityVisitLoadResult> {
  const { data: existsRaw, error: peekError } = await supabase.rpc("peek_visit_exists_for_security", {
    p_visit_id: id,
  });

  if (peekError) {
    const msg = peekError.message ?? "";
    const code = (peekError as { code?: string }).code;
    if (
      code === "42883" ||
      code === "P0001" ||
      code === "PGRST202" ||
      /function.*does not exist/i.test(msg) ||
      /schema cache/i.test(msg)
    ) {
      return { kind: "rpc_unavailable" };
    }
    if (code === "42501" || /42501|permission|not authorized|autorizado/i.test(msg)) {
      return { kind: "error", message: msg };
    }
    return { kind: "error", message: msg || "No se pudo verificar el pase." };
  }

  const existsInDb = Boolean(existsRaw);
  const { data: row, error: selectError } = await supabase.from("visits").select("*").eq("id", id).maybeSingle();

  if (selectError) {
    return { kind: "error", message: selectError.message };
  }

  if (row) {
    return { kind: "ok", visit: mapVisitFromDB(row as Record<string, unknown>) };
  }
  if (existsInDb) {
    return { kind: "rls_denied" };
  }
  return { kind: "not_found" };
}

/**
 * Morosidad del titular del pase (RPC SECURITY DEFINER). Relacionado con `current_user_property_is_delinquent()`
 * en Postgres para el propio usuario; en caseta se usa esta función para el `resident_id` del pase.
 */
export async function peekVisitResidentIsDelinquent(
  supabase: SupabaseClient,
  visitId: string
): Promise<{ delinquent: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("peek_visit_resident_is_delinquent", {
    p_visit_id: visitId,
  });

  if (error) {
    return { delinquent: false, error: error.message };
  }
  return { delinquent: Boolean(data) };
}

export async function listTodaysVisitsForGuard(supabase: SupabaseClient): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("status", "active")
    .order("valid_until", { ascending: true })
    .limit(400);

  if (error || !data) {
    console.error("[listTodaysVisitsForGuard]", error);
    return [];
  }

  const now = new Date();
  const rows = (data as Record<string, unknown>[]).map(mapVisitFromDB);
  const filtered = rows.filter((v) => isVisitListedForToday(v, now));
  filtered.sort((a, b) => visitSortTimeMinutes(a, now) - visitSortTimeMinutes(b, now));
  return filtered;
}

export async function updateVisitGuardFields(
  supabase: SupabaseClient,
  visitId: string,
  fields: { plates?: string; note?: string }
): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (fields.plates !== undefined) patch.plates = fields.plates.trim() || null;
  if (fields.note !== undefined) patch.note = fields.note.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("visits").update(patch).eq("id", visitId);
  if (error) throw error;
}

export async function markVisitUsed(supabase: SupabaseClient, visitId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_visit_used", { visit_id: visitId });
  if (error) throw error;
}

export async function fetchProfileRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: string | null; error?: string }> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return { role: null, error: error.message };
  return { role: (data?.role as string) ?? null };
}
