import { describe, it, expect, vi } from "vitest";
import { encodeVisitQrPayload, decodeVisitQrPayload, buildVisitQrPayload } from "../qr";
import type { Visit } from "../types";

const visit: Visit = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  guestName: "Ana",
  createdAt: "2026-01-15T10:00:00.000Z",
  validUntil: "2026-12-31T23:59:59.999Z",
  status: "active",
  visitType: "eventual",
  validDay: "2026-04-17",
};

describe("QR payload v2", () => {
  it("codifica y decodifica preservando campos", () => {
    const payload = buildVisitQrPayload(visit);
    expect(payload.v).toBe(2);
    const encoded = encodeVisitQrPayload(payload);
    const decoded = decodeVisitQrPayload(encoded);
    expect(decoded).not.toBeNull();
    if (!decoded || decoded.v !== 2) throw new Error("expected v2 payload");
    expect(decoded.visitId).toBe(visit.id);
    expect(decoded.visitType).toBe("eventual");
    expect(decoded.validDay).toBe("2026-04-17");
  });

  it("rechaza JSON inválido", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(decodeVisitQrPayload("%%%")).toBeNull();
    err.mockRestore();
  });
});
