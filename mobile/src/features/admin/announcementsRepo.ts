import { supabase } from "@/src/lib/supabase";

/** Valores del enum `public.announcement_category` en Supabase. */
export type AnnouncementCategory = "general" | "seguridad" | "proveedor";

/** Prioridad de producto (UI) → se persiste vía `category` + `pinned`. */
export type AlertPriority = "urgent" | "maintenance" | "general";

export type CotoAlertRow = {
  id: string;
  coto_id: string;
  category: AnnouncementCategory;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export function priorityFromRow(row: Pick<CotoAlertRow, "category" | "pinned">): AlertPriority {
  if (row.category === "seguridad" || row.pinned) return "urgent";
  if (row.category === "proveedor") return "maintenance";
  return "general";
}

export function priorityToDb(priority: AlertPriority): {
  category: AnnouncementCategory;
  pinned: boolean;
  audience: "all" | "residents";
} {
  switch (priority) {
    case "urgent":
      return { category: "seguridad", pinned: true, audience: "all" };
    case "maintenance":
      return { category: "proveedor", pinned: false, audience: "all" };
    default:
      return { category: "general", pinned: false, audience: "residents" };
  }
}

export async function fetchAlertsForCoto(cotoId: string): Promise<CotoAlertRow[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select(
      "id, coto_id, category, title, body, audience, pinned, starts_at, ends_at, created_at",
    )
    .eq("coto_id", cotoId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[admin announcements]", error);
    return [];
  }
  return (data ?? []) as CotoAlertRow[];
}

export type InsertCotoAlertInput = {
  cotoId: string;
  title: string;
  body: string;
  priority: AlertPriority;
  createdBy: string;
};

export async function insertCotoAlert(
  input: InsertCotoAlertInput,
): Promise<{ data?: CotoAlertRow; error?: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "El título es obligatorio." };
  if (!body) return { error: "El mensaje es obligatorio." };

  const { category, pinned, audience } = priorityToDb(input.priority);

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      coto_id: input.cotoId,
      title,
      body,
      category,
      pinned,
      audience,
      created_by: input.createdBy,
      starts_at: new Date().toISOString(),
    })
    .select(
      "id, coto_id, category, title, body, audience, pinned, starts_at, ends_at, created_at",
    )
    .single();

  if (error) return { error: error.message };
  return { data: data as CotoAlertRow };
}
