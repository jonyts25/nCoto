import { supabase } from "@/src/lib/supabase";

const BUCKET = "payment-proofs";

export type PaymentSubmissionStatus = "pending" | "approved" | "rejected";

export type PaymentSubmissionRow = {
  id: string;
  property_id: string;
  created_by: string;
  image_url: string;
  amount: number | null;
  status: PaymentSubmissionStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at?: string;
};

function mapRow(row: Record<string, unknown>): PaymentSubmissionRow {
  return {
    id: String(row.id),
    property_id: String(row.property_id),
    created_by: String(row.created_by),
    image_url: String(row.image_url),
    amount: row.amount != null ? Number(row.amount) : null,
    status: row.status as PaymentSubmissionStatus,
    admin_notes: row.admin_notes != null ? String(row.admin_notes) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

export async function listMyPaymentSubmissions(): Promise<PaymentSubmissionRow[]> {
  const { data, error } = await supabase
    .from("payment_submissions")
    .select("id, property_id, created_by, image_url, amount, status, admin_notes, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[payments] list:", error);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function uploadPaymentProofAndCreateSubmission(input: {
  userId: string;
  propertyId: string;
  imageUri: string;
  mimeType: string | undefined;
  amount?: number | null;
}): Promise<PaymentSubmissionRow> {
  const ext =
    input.mimeType?.includes("png") ? "png" : input.mimeType?.includes("webp") ? "webp" : "jpg";
  const objectPath = `${input.userId}/${crypto.randomUUID()}.${ext}`;
  const contentType =
    input.mimeType?.startsWith("image/") ? input.mimeType : ext === "png" ? "image/png" : "image/jpeg";

  const res = await fetch(input.imageUri);
  const buf = await res.arrayBuffer();

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
    contentType,
    upsert: false,
  });
  if (upErr) throw upErr;

  const insertPayload: Record<string, unknown> = {
    property_id: input.propertyId,
    created_by: input.userId,
    image_url: objectPath,
    status: "pending",
  };
  if (input.amount != null && !Number.isNaN(input.amount)) {
    insertPayload.amount = input.amount;
  }

  const { data, error } = await supabase.from("payment_submissions").insert([insertPayload]).select().single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
    throw error;
  }
  return mapRow(data as Record<string, unknown>);
}
