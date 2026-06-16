import { supabase } from "@/src/lib/supabase";
import { normalizeHouseKey } from "@/src/features/properties/formatHouseLabel";

export type ProfileApprovalStatus = "pending" | "approved" | "rejected";
export type OccupancyKind = "owner" | "tenant";

export type DirectoryProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  house_number: string | null;
  claimed_house_number: string | null;
  property_id: string | null;
  approval_status: ProfileApprovalStatus;
  occupancy_kind: OccupancyKind | null;
  created_at: string;
  property_house_number: string | null;
};

type ProfileDbRow = {
  id: string;
  display_name: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  house_number: string | null;
  claimed_house_number?: string | null;
  property_id: string | null;
  approval_status?: ProfileApprovalStatus | null;
  occupancy_kind?: OccupancyKind | null;
  created_at: string;
  properties?: { house_number: string } | { house_number: string }[] | null;
};

const SELECT_FULL =
  "id, display_name, full_name, email, phone, house_number, claimed_house_number, property_id, approval_status, occupancy_kind, created_at, properties:property_id ( house_number )";

const SELECT_BASIC =
  "id, display_name, house_number, property_id, created_at, properties:property_id ( house_number )";

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /Could not find the .* column/i.test(error.message ?? "")
  );
}

function mapRow(row: ProfileDbRow): DirectoryProfileRow {
  const prop = row.properties;
  const propertyHouse =
    prop == null
      ? null
      : Array.isArray(prop)
        ? prop[0]?.house_number ?? null
        : prop.house_number ?? null;

  let approval = row.approval_status ?? null;
  const declaredHouse = row.claimed_house_number?.trim() || row.house_number?.trim();
  if (!approval) {
    if (row.property_id) approval = "approved";
    else if (declaredHouse) approval = "pending";
    else approval = "approved";
  }

  return {
    id: row.id,
    display_name: row.display_name,
    full_name: row.full_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    house_number: row.house_number,
    claimed_house_number: row.claimed_house_number ?? null,
    property_id: row.property_id,
    approval_status: approval,
    occupancy_kind: row.occupancy_kind ?? null,
    created_at: row.created_at,
    property_house_number: propertyHouse,
  };
}

/** Perfiles residente del tenant efectivo (RLS). */
export async function fetchDirectoryProfiles(): Promise<DirectoryProfileRow[]> {
  const full = await supabase
    .from("profiles")
    .select(SELECT_FULL)
    .eq("role", "resident")
    .order("created_at", { ascending: false });

  let rows: ProfileDbRow[] = (full.data ?? []) as ProfileDbRow[];

  if (full.error) {
    if (isMissingColumnError(full.error)) {
      console.warn("[directory] columnas nuevas ausentes; usando select básico. Aplica supabase db push.");
      const basic = await supabase
        .from("profiles")
        .select(SELECT_BASIC)
        .eq("role", "resident")
        .order("created_at", { ascending: false });
      if (basic.error) {
        console.error("[directory]", basic.error);
        throw new Error(basic.error.message);
      }
      rows = (basic.data ?? []) as ProfileDbRow[];
    } else {
      console.error("[directory]", full.error);
      throw new Error(full.error.message);
    }
  }

  return rows.map((row) => mapRow(row));
}

export function listPendingResidents(rows: DirectoryProfileRow[]): DirectoryProfileRow[] {
  return rows.filter((r) => r.approval_status === "pending");
}

export function listActiveResidents(rows: DirectoryProfileRow[]): DirectoryProfileRow[] {
  return rows
    .filter((r) => r.approval_status !== "rejected" && Boolean(r.property_id))
    .sort((a, b) => {
      const ha = normalizeHouseKey(a.property_house_number ?? a.house_number ?? "");
      const hb = normalizeHouseKey(b.property_house_number ?? b.house_number ?? "");
      return ha.localeCompare(hb, "es", { numeric: true, sensitivity: "base" });
    });
}

export function occupancyLabel(kind: OccupancyKind | null): string {
  if (kind === "owner") return "Dueño";
  if (kind === "tenant") return "Inquilino";
  return "No indicado";
}

async function findOrCreatePropertyId(
  cotoId: string,
  houseNumber: string,
): Promise<{ propertyId?: string; error?: string }> {
  const raw = houseNumber.trim();
  if (!raw) return { error: "Falta el número de casa en la solicitud." };

  const { data: existing, error: listErr } = await supabase
    .from("properties")
    .select("id, house_number")
    .eq("coto_id", cotoId);

  if (listErr) return { error: listErr.message };

  const key = normalizeHouseKey(raw);
  const match = (existing ?? []).find((p) => normalizeHouseKey(String(p.house_number)) === key);
  if (match) return { propertyId: String(match.id) };

  const unit = normalizeHouseKey(raw) || raw;
  const { data: created, error: insErr } = await supabase
    .from("properties")
    .insert({ coto_id: cotoId, house_number: unit })
    .select("id")
    .single();

  if (insErr) return { error: insErr.message };
  return { propertyId: String(created.id) };
}

export async function approveResident(
  profileId: string,
  cotoId: string,
): Promise<{ error?: string }> {
  const { data: prof, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, house_number, claimed_house_number, role")
    .eq("id", profileId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!prof) return { error: "Perfil no encontrado." };
  if (prof.role !== "resident") return { error: "Solo se aprueban solicitudes de residentes." };

  const house = String(prof.claimed_house_number ?? prof.house_number ?? "").trim();
  if (!house) return { error: "La solicitud no incluye número de casa." };

  const { propertyId, error: propErr } = await findOrCreatePropertyId(cotoId, house);
  if (propErr || !propertyId) return { error: propErr ?? "No se pudo vincular la propiedad." };

  const payloadFull = {
    property_id: propertyId,
    house_number: normalizeHouseKey(house) || house,
    approval_status: "approved" as const,
  };
  let { error: upErr } = await supabase.from("profiles").update(payloadFull).eq("id", profileId);

  if (upErr && isMissingColumnError(upErr)) {
    ({ error: upErr } = await supabase
      .from("profiles")
      .update({
        property_id: propertyId,
        house_number: normalizeHouseKey(house) || house,
      })
      .eq("id", profileId));
  }

  if (upErr) return { error: upErr.message };
  return {};
}

export async function rejectResident(profileId: string): Promise<{ error?: string }> {
  let { error } = await supabase
    .from("profiles")
    .update({
      approval_status: "rejected",
      property_id: null,
      house_number: null,
      claimed_house_number: null,
    })
    .eq("id", profileId);

  if (error && isMissingColumnError(error)) {
    ({ error } = await supabase
      .from("profiles")
      .update({ property_id: null, house_number: null })
      .eq("id", profileId));
  }

  if (error) return { error: error.message };
  return {};
}
