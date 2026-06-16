import { useState, useEffect, useMemo, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import type { UserAppRole } from "@/src/features/visits/types";

export type { UserAppRole };

export type AuthProfile = {
  role: UserAppRole;
  coto_id: string;
  active_coto_id: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  claimed_house_number: string | null;
  house_number: string | null;
  occupancy_kind: "owner" | "tenant" | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  /** Unidad inmobiliaria vinculada (Realtime morosidad, etc.). */
  property_id: string | null;
};

export type AuthIssue = null | "missing_email" | "missing_profile";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authIssue, setAuthIssue] = useState<AuthIssue>(null);

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    const fullSelect =
      "role, coto_id, active_coto_id, display_name, full_name, phone, claimed_house_number, house_number, occupancy_kind, approval_status, property_id";

    let { data, error } = await supabase
      .from("profiles")
      .select(fullSelect)
      .eq("id", userId)
      .maybeSingle();

    if (error && /column .* does not exist|PGRST204|42703/i.test(error.message ?? "")) {
      ({ data, error } = await supabase
        .from("profiles")
        .select("role, coto_id, active_coto_id, display_name, property_id, house_number")
        .eq("id", userId)
        .maybeSingle());
    }

    setProfileLoading(false);
    if (error) {
      console.error("[useAuth] profiles:", error);
      setProfile(null);
      setAuthIssue("missing_profile");
      return;
    }
    if (!data?.role || !data.coto_id) {
      setProfile(null);
      setAuthIssue("missing_profile");
      return;
    }
    setAuthIssue(null);
    setProfile({
      role: data.role as UserAppRole,
      coto_id: data.coto_id as string,
      active_coto_id: (data.active_coto_id as string | null) ?? null,
      display_name: (data.display_name as string | null) ?? null,
      full_name: (data.full_name as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      claimed_house_number: (data.claimed_house_number as string | null) ?? null,
      house_number: (data.house_number as string | null) ?? null,
      occupancy_kind: (data.occupancy_kind as "owner" | "tenant" | null) ?? null,
      approval_status: (data.approval_status as AuthProfile["approval_status"]) ?? null,
      property_id: (data.property_id as string | null) ?? null,
    });
  }, []);

  const refetchProfile = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (s?.user?.id) await loadProfile(s.user.id);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;

    function applySession(next: Session | null) {
      if (cancelled) return;
      setSession(next);
      if (!next?.user) {
        setProfile(null);
        setAuthIssue(null);
        setProfileLoading(false);
        return;
      }
      const email = next.user.email ?? undefined;
      if (!email?.trim()) {
        setAuthIssue("missing_email");
        setProfile(null);
        setProfileLoading(false);
        return;
      }
      setAuthIssue(null);
      void loadProfile(next.user.id);
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        applySession(s);
        if (!cancelled) setSessionLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const isLoading = sessionLoading || (!!session?.user && profileLoading);

  const userRole = useMemo((): UserAppRole | null => {
    if (!session?.user || authIssue === "missing_email") return null;
    if (authIssue === "missing_profile") return null;
    return profile?.role ?? null;
  }, [session, profile, authIssue]);

  return {
    session,
    isLoading,
    userRole,
    profile,
    authIssue,
    refetchProfile,
    isGuardUser: userRole === "guard",
  };
}
