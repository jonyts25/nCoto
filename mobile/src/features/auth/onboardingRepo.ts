import { supabase } from "@/src/lib/supabase";
import { normalizeHouseKey } from "@/src/features/properties/formatHouseLabel";
import type { OccupancyKind } from "@/src/features/admin/directoryRepo";

export type SubmitAccessRequestInput = {
  fullName: string;
  phone: string;
  claimedHouseNumber: string;
  occupancyKind: OccupancyKind;
};

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /Could not find the .* column/i.test(error.message ?? "")
  );
}

export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<{ error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión requerida." };

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const house = input.claimedHouseNumber.trim();

  if (!fullName) return { error: "Indica tu nombre completo." };
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    return { error: "Indica un teléfono válido (mínimo 10 dígitos)." };
  }
  if (!house) return { error: "Indica el número de casa." };

  const unit = normalizeHouseKey(house) || house;

  const payloadFull = {
    full_name: fullName,
    display_name: fullName,
    phone,
    claimed_house_number: unit,
    house_number: unit,
    occupancy_kind: input.occupancyKind,
    approval_status: "pending" as const,
    property_id: null,
  };

  let { error } = await supabase.from("profiles").update(payloadFull).eq("id", user.id);

  if (error && isMissingColumnError(error)) {
    ({ error } = await supabase
      .from("profiles")
      .update({
        display_name: fullName,
        house_number: unit,
        occupancy_kind: input.occupancyKind,
        approval_status: "pending",
        property_id: null,
      })
      .eq("id", user.id));
  }

  if (error) return { error: error.message };
  return {};
}

export function residentNeedsOnboarding(profile: {
  role: string;
  approval_status?: string | null;
  claimed_house_number?: string | null;
  property_id?: string | null;
  full_name?: string | null;
  display_name?: string | null;
}): boolean {
  if (profile.role !== "resident") return false;
  if (profile.property_id) return false;
  if (profile.approval_status === "approved") return false;
  if (profile.approval_status === "rejected") return true;
  const claimed = profile.claimed_house_number?.trim();
  if (profile.approval_status === "pending" && claimed) return false;
  const name = profile.full_name?.trim() || profile.display_name?.trim();
  return !name || !claimed;
}

export function residentIsAwaitingApproval(profile: {
  role: string;
  approval_status?: string | null;
  claimed_house_number?: string | null;
  house_number?: string | null;
  property_id?: string | null;
}): boolean {
  if (profile.role !== "resident") return false;
  if (profile.property_id) return false;
  if (profile.approval_status !== "pending") return false;
  return Boolean(
    profile.claimed_house_number?.trim() || profile.house_number?.trim(),
  );
}
