import { supabase } from "@/src/lib/supabase";

export type CotoDisplayRow = {
  id: string;
  name: string;
  banner_image_url: string | null;
};

export async function fetchCotoById(cotoId: string | null | undefined): Promise<CotoDisplayRow | null> {
  if (!cotoId?.trim()) return null;

  const full = await supabase.from("cotos").select("id, name, banner_image_url").eq("id", cotoId.trim()).maybeSingle();
  if (!full.error && full.data) {
    return {
      id: String(full.data.id),
      name: String(full.data.name ?? ""),
      banner_image_url: full.data.banner_image_url != null ? String(full.data.banner_image_url) : null,
    };
  }

  const basic = await supabase.from("cotos").select("id, name").eq("id", cotoId.trim()).maybeSingle();
  if (basic.error || !basic.data) return null;
  return {
    id: String(basic.data.id),
    name: String(basic.data.name ?? ""),
    banner_image_url: null,
  };
}
