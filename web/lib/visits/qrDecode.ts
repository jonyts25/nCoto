import { z } from "zod";
import type { VisitKind } from "./types";

function decodeBase64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

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

export type VisitQrPayload =
  | z.infer<typeof VisitQrPayloadV1Schema>
  | z.infer<typeof VisitQrPayloadV2Schema>;

export function decodeVisitQrPayload(data: string): { visitId: string; visitType?: VisitKind } | null {
  try {
    const jsonString = decodeBase64ToUtf8(data.trim());
    const payload = JSON.parse(jsonString) as unknown;

    const v2 = VisitQrPayloadV2Schema.safeParse(payload);
    if (v2.success) return { visitId: v2.data.visitId, visitType: v2.data.visitType };

    const v1 = VisitQrPayloadV1Schema.safeParse(payload);
    if (v1.success) return { visitId: v1.data.visitId };

    return null;
  } catch {
    return null;
  }
}
