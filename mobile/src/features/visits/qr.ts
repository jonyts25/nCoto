import type { Visit, VisitKind } from "./types";
import { encode, decode } from "base-64";
import { z } from "zod";

export type VisitQrPayloadV1 = {
  v: 1;
  visitId: string;
  validUntil: string;
  createdAt: string;
};

export type VisitQrPayloadV2 = {
  v: 2;
  visitId: string;
  validUntil: string;
  createdAt: string;
  visitType: VisitKind;
  validDay?: string;
};

export type VisitQrPayload = VisitQrPayloadV1 | VisitQrPayloadV2;

const isoLike = z.string().min(10);

const VisitQrPayloadV1Schema = z.object({
  v: z.literal(1),
  visitId: z.string().uuid(),
  validUntil: isoLike,
  createdAt: isoLike,
});

const VisitQrPayloadV2Schema = z.object({
  v: z.literal(2),
  visitId: z.string().uuid(),
  validUntil: isoLike,
  createdAt: isoLike,
  visitType: z.enum(["eventual", "frecuente", "servicio", "paqueteria"]),
  validDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function buildVisitQrPayload(visit: Visit): VisitQrPayload {
  return {
    v: 2,
    visitId: visit.id,
    validUntil: visit.validUntil,
    createdAt: visit.createdAt,
    visitType: visit.visitType ?? "eventual",
    validDay: visit.validDay,
  };
}

export function encodeVisitQrPayload(payload: VisitQrPayload): string {
  const jsonString = JSON.stringify(payload);
  return encode(jsonString);
}

export function decodeVisitQrPayload(data: string): VisitQrPayload | null {
  try {
    const jsonString = decode(data);
    const payload = JSON.parse(jsonString);

    const v2 = VisitQrPayloadV2Schema.safeParse(payload);
    if (v2.success) return v2.data;

    const v1 = VisitQrPayloadV1Schema.safeParse(payload);
    if (v1.success) return v1.data;

    console.error("Invalid QR payload structure");
    return null;
  } catch (error) {
    console.error("Failed to decode or parse QR payload:", error);
    return null;
  }
}
