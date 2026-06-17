import { useCallback, useEffect, useState } from "react";
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
import { supabase } from "@/src/lib/supabase";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import {
  endOfLocalDay,
  endOfLocalDayFromISODate,
  formatLocalDateISO,
  isRestrictedSingleDayKind,
  isValidHm,
  normalizeTimeHm,
  normalizeValidDayString,
  parseWeeklySchedule,
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
      row.presence != null
        ? (String(row.presence) as VisitPresence)
        : row.presence === null
          ? null
          : undefined,
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
    presenceRaw === "outside" || presenceRaw === "inside" ? (presenceRaw as VisitPresence) : null;
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

function toPgTime(hm: string): string {
  const [h, m] = hm.trim().split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
}

type VisitWriteInput = {
  guestName: string;
  plates?: string;
  note?: string;
  visitType: VisitKind;
  schedule?: WeeklySlot[];
  validDay?: string;
  startTime?: string;
  endTime?: string;
};

function computeVisitFields(input: VisitWriteInput): {
  validUntil: string;
  validDay: string | null;
  scheduleJson: WeeklySlot[] | null;
  startTime: string | null;
  endTime: string | null;
} {
  const visitType = input.visitType;
  const today = new Date();
  const dayStr = input.validDay?.trim() || formatLocalDateISO(today);

  let validUntil: string;
  let validDay: string | null = null;
  let scheduleJson: WeeklySlot[] | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (visitType === "frecuente") {
    const slots =
      input.schedule && input.schedule.length > 0
        ? input.schedule
        : [{ weekday: 4, start: "09:00", end: "10:00" }];
    scheduleJson = slots;
    validUntil = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  } else if (visitType === "eventual" || isRestrictedSingleDayKind(visitType)) {
    validDay = dayStr;
    validUntil = endOfLocalDayFromISODate(dayStr).toISOString();
    if (input.startTime && input.endTime && isValidHm(input.startTime) && isValidHm(input.endTime)) {
      startTime = toPgTime(input.startTime);
      endTime = toPgTime(input.endTime);
    }
  } else {
    validUntil = endOfLocalDay(today).toISOString();
    validDay = dayStr;
  }

  return { validUntil, validDay, scheduleJson, startTime, endTime };
}

function buildVisitRow(input: VisitWriteInput) {
  const { validUntil, validDay, scheduleJson, startTime, endTime } = computeVisitFields(input);
  return {
    guest_name: input.guestName.trim(),
    plates: input.plates?.trim() || null,
    note: input.note?.trim() || null,
    valid_until: validUntil,
    visit_type: input.visitType,
    schedule: scheduleJson,
    valid_day: validDay,
    start_time: startTime,
    end_time: endTime,
  };
}

/**
 * Listado de visitas para la sesión actual. El aislamiento por coto y rol (residente vs guardia)
 * debe cumplirse en RLS en Supabase; no filtrar aquí por resident_id/email como única defensa.
 */
export async function listVisitsScoped(): Promise<Visit[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Error fetching visits:", error);
    return [];
  }

  return (data ?? []).map((row) => mapVisitFromDB(row as Record<string, unknown>));
}

export async function listVisits(): Promise<Visit[]> {
  return listVisitsScoped();
}

export function useVisitRepo() {
  const { scopeVersion } = useCotoScope();
  const [visits, setVisits] = useState<Visit[]>([]);
  const load = useCallback(() => listVisitsScoped().then(setVisits), []);
  useEffect(() => {
    load();
  }, [load, scopeVersion]);
  return { visits, refresh: load };
}

export async function createVisit(input: VisitWriteInput): Promise<Visit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Usuario no autenticado. No se puede crear la visita.");

  const row = {
    ...buildVisitRow(input),
    status: "active",
    resident_id: session.user.id,
  };

  const { data, error } = await supabase.from("visits").insert([row]).select().single();

  if (error) throw error;
  return mapVisitFromDB(data as Record<string, unknown>);
}

export async function updateVisit(id: string, input: VisitWriteInput): Promise<Visit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Usuario no autenticado.");

  const row = buildVisitRow(input);

  const { data, error } = await supabase
    .from("visits")
    .update(row)
    .eq("id", id)
    .eq("status", "active")
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("No se pudo actualizar el pase (¿ya fue usado o expiró?).");
  return mapVisitFromDB(data as Record<string, unknown>);
}

export async function getVisitById(id: string): Promise<Visit | null> {
  const { data, error } = await supabase.from("visits").select("*").eq("id", id).single();

  if (error) {
    console.error("Error fetching visit by ID:", error);
    return null;
  }
  return mapVisitFromDB(data as Record<string, unknown>);
}

export type SecurityVisitLoadResult =
  | { kind: "ok"; visit: Visit }
  | { kind: "not_found" }
  | { kind: "rls_denied" }
  | { kind: "rpc_unavailable" }
  | { kind: "error"; message: string };

/**
 * Carga una visita en caseta: compara SELECT (sujeto a RLS) con existencia real vía RPC SECURITY DEFINER.
 * Requiere la migración `peek_visit_exists_for_security` en Supabase.
 */
export async function loadVisitForSecurityScreen(id: string): Promise<SecurityVisitLoadResult> {
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
    console.error("Error fetching visit by ID (security):", selectError);
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
 * Morosidad del titular del pase (RPC SECURITY DEFINER), misma semántica que la caseta web.
 */
export async function peekVisitResidentIsDelinquent(visitId: string): Promise<{ delinquent: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("peek_visit_resident_is_delinquent", {
    p_visit_id: visitId,
  });

  if (error) {
    return { delinquent: false, error: error.message };
  }
  return { delinquent: Boolean(data) };
}

export async function markVisitUsed(id: string): Promise<void> {
  const { error } = await supabase.rpc("mark_visit_used", { visit_id: id });

  if (error) {
    console.error("Error al marcar la visita como usada:", error);
    throw error;
  }
}

export async function extendPaqueteriaVisitNextDay(id: string): Promise<void> {
  const { error } = await supabase.rpc("extend_paqueteria_visit_next_day", { visit_id: id });
  if (error) throw error;
}
