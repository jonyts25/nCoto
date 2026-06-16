import { describe, it, expect } from "vitest";
import {
  canValidateVisitNow,
  endOfLocalDayFromISODate,
  formatLocalDateISO,
  isVisitExpiredByValidUntil,
  isVisitNotExpired,
  normalizeValidDayString,
  parseWeeklySchedule,
  isWithinWeeklySchedule,
} from "../validation";
import type { Visit } from "../types";

const VID = "550e8400-e29b-41d4-a716-446655440001";

function baseVisit(over: Partial<Visit>): Visit {
  return {
    id: VID,
    guestName: "Test",
    createdAt: "2026-01-01T12:00:00.000Z",
    validUntil: "2030-12-31T23:59:59.999Z",
    status: "active",
    visitType: "eventual",
    ...over,
  };
}

describe("normalizeValidDayString", () => {
  it("preserva YYYY-MM-DD sin correr el día por UTC", () => {
    expect(normalizeValidDayString("2026-05-22")).toBe("2026-05-22");
    expect(normalizeValidDayString("2026-05-22T00:00:00+00:00")).toBe("2026-05-22");
  });
});

describe("isVisitExpiredByValidUntil", () => {
  it("permite el mismo día calendario hasta fin de día local", () => {
    const today = "2026-05-22";
    const now = new Date(2026, 4, 22, 15, 30, 0);
    const visit = baseVisit({
      validDay: today,
      validUntil: endOfLocalDayFromISODate(today).toISOString(),
    });
    expect(isVisitExpiredByValidUntil(visit, now)).toBe(false);
    expect(isVisitNotExpired(visit, now)).toBe(true);
  });

  it("expira después del fin del día local", () => {
    const today = "2026-05-22";
    const afterMidnight = new Date(2026, 4, 23, 0, 0, 1);
    const visit = baseVisit({
      validDay: today,
      validUntil: endOfLocalDayFromISODate(today).toISOString(),
    });
    expect(isVisitExpiredByValidUntil(visit, afterMidnight)).toBe(true);
  });
});

describe("parseWeeklySchedule", () => {
  it("acepta un bloque válido", () => {
    const r = parseWeeklySchedule([{ weekday: 1, start: "09:00", end: "18:00" }]);
    expect(r).toEqual([{ weekday: 1, start: "09:00", end: "18:00" }]);
  });

  it("rechaza inicio >= fin", () => {
    expect(parseWeeklySchedule([{ weekday: 1, start: "18:00", end: "09:00" }])).toBeNull();
  });
});

describe("isWithinWeeklySchedule", () => {
  it("detecta horario en el mismo día de la semana", () => {
    const now = new Date(2026, 3, 17, 10, 30, 0);
    const ok = isWithinWeeklySchedule(now, [{ weekday: 5, start: "09:00", end: "11:00" }]);
    expect(ok).toBe(true);
  });
});

describe("canValidateVisitNow", () => {
  it("rechaza visita no activa", () => {
    const r = canValidateVisitNow(baseVisit({ status: "used" }));
    expect(r.ok).toBe(false);
  });

  it("rechaza si el día calendario ya pasó (validDay)", () => {
    const r = canValidateVisitNow(
      baseVisit({ validDay: "2020-01-01", validUntil: "2020-01-01T23:59:59.999Z" }),
      new Date(2026, 3, 17, 12, 0, 0)
    );
    expect(r.ok).toBe(false);
  });

  it("eventual: acepta validDay = hoy en hora local", () => {
    const now = new Date(2026, 3, 17, 12, 0, 0);
    const today = formatLocalDateISO(now);
    const ok = canValidateVisitNow(
      baseVisit({
        visitType: "eventual",
        validDay: today,
        validUntil: endOfLocalDayFromISODate(today).toISOString(),
      }),
      now
    );
    expect(ok.ok).toBe(true);

    const bad = canValidateVisitNow(baseVisit({ visitType: "eventual", validDay: "2020-01-01" }), now);
    expect(bad.ok).toBe(false);
  });

  it("eventual: rechaza antes de start_time", () => {
    const now = new Date(2026, 3, 17, 8, 0, 0);
    const today = formatLocalDateISO(now);
    const r = canValidateVisitNow(
      baseVisit({
        visitType: "eventual",
        validDay: today,
        startTime: "09:00",
        endTime: "18:00",
        validUntil: endOfLocalDayFromISODate(today).toISOString(),
      }),
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Aún no es hora");
  });

  it("eventual: rechaza después de end_time", () => {
    const now = new Date(2026, 3, 17, 19, 0, 0);
    const today = formatLocalDateISO(now);
    const r = canValidateVisitNow(
      baseVisit({
        visitType: "eventual",
        validDay: today,
        startTime: "09:00",
        endTime: "18:00",
        validUntil: endOfLocalDayFromISODate(today).toISOString(),
      }),
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("expiró por horario");
  });

  it("eventual: acepta dentro de la ventana horaria", () => {
    const now = new Date(2026, 3, 17, 10, 30, 0);
    const today = formatLocalDateISO(now);
    const r = canValidateVisitNow(
      baseVisit({
        visitType: "eventual",
        validDay: today,
        startTime: "09:00",
        endTime: "18:00",
        validUntil: endOfLocalDayFromISODate(today).toISOString(),
      }),
      now
    );
    expect(r.ok).toBe(true);
  });

  it("frecuente: exige estar en ventana de horario", () => {
    const now = new Date(2026, 3, 17, 10, 30, 0);
    const r = canValidateVisitNow(
      baseVisit({
        visitType: "frecuente",
        schedule: [{ weekday: 5, start: "09:00", end: "11:00" }],
      }),
      now
    );
    expect(r.ok).toBe(true);
  });
});
