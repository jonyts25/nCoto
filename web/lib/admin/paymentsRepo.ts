import type { SupabaseClient } from "@supabase/supabase-js";

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
  };
}

const BUCKET = "payment-proofs";

export async function fetchPendingPaymentSubmissions(
  supabase: SupabaseClient,
  propertyIds: string[]
): Promise<PaymentSubmissionRow[]> {
  if (!propertyIds.length) return [];
  const { data, error } = await supabase
    .from("payment_submissions")
    .select("id, property_id, created_by, image_url, amount, status, admin_notes, created_at")
    .in("property_id", propertyIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin payments]", error);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function createSignedProofUrl(
  supabase: SupabaseClient,
  objectPath: string,
  expiresIn = 7200
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) {
    console.error("[admin payments] signed url", error);
    return null;
  }
  return data.signedUrl;
}

export async function approvePaymentSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  propertyId: string
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from("payment_submissions")
    .update({
      status: "approved",
      admin_notes: null,
      updated_at: now,
    })
    .eq("id", submissionId);
  if (e1) return { error: e1.message };

  const { error: e2 } = await supabase
    .from("properties")
    .update({ is_delinquent: false, updated_at: now })
    .eq("id", propertyId);
  if (e2) return { error: e2.message };

  return {};
}

export async function rejectPaymentSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  adminNotes: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("payment_submissions")
    .update({
      status: "rejected",
      admin_notes: adminNotes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { error: error.message };
  return {};
}
