import type { Visit, VisitKind, WeeklySlot } from "./types";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseWeeklySchedule(raw: unknown): WeeklySlot[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: WeeklySlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const w = (row as WeeklySlot).weekday;
    const start = (row as WeeklySlot).start;
    const end = (row as WeeklySlot).end;
    if (typeof w !== "number" || w < 0 || w > 6) return null;
    if (typeof start !== "string" || typeof end !== "string") return null;
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if (sh * 60 + sm >= eh * 60 + em) return null;
    out.push({ weekday: w, start, end });
  }
  return out;
}

export function formatLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Fin del día calendario YYYY-MM-DD en hora local (sin desfase UTC). */
export function endOfLocalDayFromISODate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return endOfLocalDay(new Date(y, m - 1, d));
}

export function normalizeValidDayString(vd: unknown): string | undefined {
  if (vd == null) return undefined;
  const s = String(vd).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return undefined;
  const datePart = m[1];
  if (s.length === 10 || /T00:00:00(\.0+)?(Z|[+-]00:?00)?$/i.test(s)) {
    return datePart;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return formatLocalDateISO(parsed);
  return datePart;
}

export function normalizeTimeHm(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function isValidHm(hm: string): boolean {
  return TIME_RE.test(hm.trim());
}

export function isRestrictedSingleDayKind(kind: VisitKind): boolean {
  return kind === "servicio" || kind === "paqueteria";
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function isWithinWeeklySchedule(now: Date, slots: WeeklySlot[] | undefined): boolean {
  if (!slots?.length) return false;
  const wd = now.getDay();
  const mins = minutesOfDay(now);
  return slots.some((s) => {
    if (s.weekday !== wd) return false;
    return mins >= parseHm(s.start) && mins <= parseHm(s.end);
  });
}

export function isVisitExpiredByValidUntil(visit: Visit, now: Date = new Date()): boolean {
  if (visit.validDay) {
    return now.getTime() > endOfLocalDayFromISODate(visit.validDay).getTime();
  }
  const until = new Date(visit.validUntil);
  if (Number.isNaN(until.getTime())) return true;
  const localDay = formatLocalDateISO(until);
  return now.getTime() > endOfLocalDayFromISODate(localDay).getTime();
}

export function isVisitNotExpired(visit: Visit, now: Date = new Date()): boolean {
  return visit.status === "active" && !isVisitExpiredByValidUntil(visit, now);
}

export type GuardValidationResult = { ok: true } | { ok: false; reason: string };

function validateDailyTimeWindow(visit: Visit, now: Date): GuardValidationResult {
  const start = visit.startTime;
  const end = visit.endTime;
  if (!start || !end) return { ok: true };

  if (!isValidHm(start) || !isValidHm(end)) return { ok: true };
  if (parseHm(start) >= parseHm(end)) {
    return { ok: false, reason: "Horario del pase mal configurado (inicio ≥ fin)." };
  }

  const mins = minutesOfDay(now);
  const startM = parseHm(start);
  const endM = parseHm(end);
  if (mins < startM) {
    return { ok: false, reason: "Aún no es hora de entrada." };
  }
  if (mins > endM) {
    return { ok: false, reason: "El pase ya expiró por horario." };
  }
  return { ok: true };
}

export function canValidateVisitNow(visit: Visit, now: Date = new Date()): GuardValidationResult {
  if (visit.status !== "active") {
    return { ok: false, reason: "El pase no está activo." };
  }

  if (isVisitExpiredByValidUntil(visit, now)) {
    return { ok: false, reason: "La vigencia del pase ya expiró." };
  }

  const kind = visit.visitType ?? "eventual";

  if (kind === "frecuente") {
    const slots = visit.schedule;
    if (!slots?.length) {
      return { ok: false, reason: "Esta visita frecuente no tiene horarios configurados." };
    }
    if (!isWithinWeeklySchedule(now, slots)) {
      return { ok: false, reason: "Fuera del día u horario permitido para esta visita frecuente." };
    }
    return { ok: true };
  }

  if (isRestrictedSingleDayKind(kind) || kind === "eventual") {
    if (visit.validDay) {
      const today = formatLocalDateISO(now);
      if (visit.validDay !== today) {
        return {
          ok: false,
          reason:
            kind === "eventual"
              ? "Este pase eventual solo es válido el día autorizado."
              : "Este pase solo es válido durante el día autorizado.",
        };
      }
    }
    return validateDailyTimeWindow(visit, now);
  }

  return { ok: true };
}

export function formatVisitTimeRange(visit: Visit): string | null {
  if (visit.visitType === "frecuente" && visit.schedule?.[0]) {
    return `${visit.schedule[0].start} – ${visit.schedule[0].end}`;
  }
  if (visit.startTime && visit.endTime) {
    return `${visit.startTime} – ${visit.endTime}`;
  }
  return null;
}

/** Orden caseta: horario del slot de hoy (frecuente) o mediodía del día de vigencia / valid_until. */
export function visitSortTimeMinutes(visit: Visit, now: Date): number {
  if (visit.visitType === "frecuente" && visit.schedule?.length) {
    const wd = now.getDay();
    const slot = visit.schedule.find((s) => s.weekday === wd);
    if (slot) return parseHm(slot.start);
  }
  if (visit.startTime && isValidHm(visit.startTime)) return parseHm(visit.startTime);
  const d = new Date(visit.validUntil);
  return d.getHours() * 60 + d.getMinutes();
}

export function isVisitListedForToday(visit: Visit, now: Date): boolean {
  if (visit.status !== "active") return false;
  if (isVisitExpiredByValidUntil(visit, now)) return false;
  const today = formatLocalDateISO(now);

  if (visit.visitType === "frecuente") {
    return isWithinWeeklySchedule(now, visit.schedule);
  }

  if (visit.validDay) {
    return visit.validDay === today;
  }

  const vu = new Date(visit.validUntil);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = endOfLocalDay(now);
  return vu >= start && vu <= end;
}
