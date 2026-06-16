import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/features/auth/useAuth";

export type CotoRow = { id: string; name: string; slug: string | null };

type CotoScopeValue = {
  effectiveCotoId: string | null;
  /** Superadmin (role admin): lista de cotos y cambio de coto activo */
  isSuperadmin: boolean;
  cotos: CotoRow[];
  cotosLoading: boolean;
  setActiveCotoId: (cotoId: string) => Promise<void>;
  refreshScope: () => Promise<void>;
  /** Incrementa cuando cambia el tenant para forzar refetch en listas */
  scopeVersion: number;
};

const CotoScopeContext = createContext<CotoScopeValue | null>(null);

export function CotoScopeProvider({ children }: { children: React.ReactNode }) {
  const { session, userRole, profile, refetchProfile } = useAuth();
  const [cotos, setCotos] = useState<CotoRow[]>([]);
  const [cotosLoading, setCotosLoading] = useState(false);
  const [scopeVersion, setScopeVersion] = useState(0);

  const isSuperadmin = userRole === "admin";

  const effectiveCotoId = useMemo(() => {
    if (!profile?.coto_id) return null;
    if (userRole === "admin") {
      return profile.active_coto_id ?? profile.coto_id;
    }
    return profile.coto_id;
  }, [profile, userRole]);

  const loadCotos = useCallback(async () => {
    if (!session?.user || !isSuperadmin) {
      setCotos([]);
      return;
    }
    setCotosLoading(true);
    const { data, error } = await supabase.from("cotos").select("id, name, slug").order("name");
    setCotosLoading(false);
    if (error) {
      console.error("[CotoScope] cotos:", error);
      setCotos([]);
      return;
    }
    setCotos((data ?? []) as CotoRow[]);
  }, [session?.user?.id, isSuperadmin]);

  useEffect(() => {
    void loadCotos();
  }, [loadCotos]);

  const setActiveCotoId = useCallback(
    async (cotoId: string) => {
      if (!session?.user?.id || userRole !== "admin") return;
      const { error } = await supabase
        .from("profiles")
        .update({ active_coto_id: cotoId, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);
      if (error) throw error;
      await refetchProfile();
      setScopeVersion((v) => v + 1);
    },
    [session?.user?.id, userRole, refetchProfile]
  );

  const refreshScope = useCallback(async () => {
    await refetchProfile();
    await loadCotos();
    setScopeVersion((v) => v + 1);
  }, [refetchProfile, loadCotos]);

  const value = useMemo(
    () => ({
      effectiveCotoId,
      isSuperadmin,
      cotos,
      cotosLoading,
      setActiveCotoId,
      refreshScope,
      scopeVersion,
    }),
    [effectiveCotoId, isSuperadmin, cotos, cotosLoading, setActiveCotoId, refreshScope, scopeVersion]
  );

  return <CotoScopeContext.Provider value={value}>{children}</CotoScopeContext.Provider>;
}

export function useCotoScope() {
  const ctx = useContext(CotoScopeContext);
  if (!ctx) {
    throw new Error("useCotoScope debe usarse dentro de CotoScopeProvider");
  }
  return ctx;
}
