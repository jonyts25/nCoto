import type { Visit } from "./types";

export type VisitQrPayloadV1 = {
  v: 1;                 // version del payload
  visitId: string;
  validUntil: string;   // ISO
  createdAt: string;    // ISO
  // luego añadimos:
  // residentId?: string;
  // cotoId?: string;
};

export function buildVisitQrPayload(visit: Visit): VisitQrPayloadV1 {
  return {
    v: 1,
    visitId: visit.id,
    validUntil: visit.validUntil,
    createdAt: visit.createdAt,
  };
}

export function encodeVisitQrPayload(payload: VisitQrPayloadV1): string {
  // string final que va al QR
  return JSON.stringify(payload);
}
