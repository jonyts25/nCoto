import { supabase } from "@/src/lib/supabase";

export type CotoFinanceEntryType = "payment_income" | "manual_expense";

export type CotoFinanceRow = {
  id: string;
  coto_id: string;
  entry_type: CotoFinanceEntryType;
  amount: number;
  description: string;
  payment_submission_id: string | null;
  created_by: string | null;
  created_at: string;
};

function mapRow(r: Record<string, unknown>): CotoFinanceRow {
  return {
    id: String(r.id),
    coto_id: String(r.coto_id),
    entry_type: r.entry_type as CotoFinanceEntryType,
    amount: Number(r.amount),
    description: String(r.description ?? ""),
    payment_submission_id: r.payment_submission_id != null ? String(r.payment_submission_id) : null,
    created_by: r.created_by != null ? String(r.created_by) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export function computeBalance(rows: CotoFinanceRow[]): number {
  let sum = 0;
  for (const r of rows) {
    if (r.entry_type === "payment_income") sum += r.amount;
    else sum -= r.amount;
  }
  return Math.round(sum * 100) / 100;
}

export async function fetchCotoFinances(cotoId: string): Promise<CotoFinanceRow[]> {
  const { data, error } = await supabase
    .from("coto_finances")
    .select("id, coto_id, entry_type, amount, description, payment_submission_id, created_by, created_at")
    .eq("coto_id", cotoId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[treasury]", error);
    return [];
  }
  return (data ?? []).map((x) => mapRow(x as Record<string, unknown>));
}

export async function insertManualExpense(input: {
  cotoId: string;
  amount: number;
  description: string;
}): Promise<{ error?: string }> {
  if (input.amount <= 0) return { error: "El monto debe ser mayor a cero." };
  const d = input.description.trim();
  if (d.length < 3) return { error: "Describe el egreso (mín. 3 caracteres)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión requerida." };

  const { error } = await supabase.from("coto_finances").insert([
    {
      coto_id: input.cotoId,
      entry_type: "manual_expense",
      amount: input.amount,
      description: d,
      created_by: user.id,
    },
  ]);

  if (error) return { error: error.message };
  return {};
}
