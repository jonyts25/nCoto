"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PendingPaymentsSection } from "@/components/admin/PendingPaymentsSection";

type ProfileRow = {
  id: string;
  role: string;
  coto_id: string;
  active_coto_id: string | null;
};

type CotoRow = { id: string; name: string; slug: string | null };

export type PropertyRow = {
  id: string;
  coto_id: string;
  house_number: string;
  display_label: string | null;
  is_delinquent: boolean;
  created_at?: string;
  updated_at?: string;
};

function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en web/.env.local");
  }
  return createClient(url, key);
}

function effectiveCotoId(profile: ProfileRow | null): string | null {
  if (!profile?.coto_id) return null;
  if (profile.role === "admin") {
    return profile.active_coto_id ?? profile.coto_id;
  }
  return profile.coto_id;
}

export function CotoPropertiesDashboard() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [cotos, setCotos] = useState<CotoRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [authError, setAuthError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setSupabase(createBrowserSupabase());
  }, []);

  const loadProfile = useCallback(async (client: SupabaseClient, uid: string) => {
    const { data, error } = await client
      .from("profiles")
      .select("id, role, coto_id, active_coto_id")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      setProfile(null);
      setProfileError(error.message);
      return;
    }
    if (!data) {
      setProfile(null);
      setProfileError("Sin fila en profiles para este usuario.");
      return;
    }
    setProfileError(null);
    setProfile(data as ProfileRow);
  }, []);

  const loadCotos = useCallback(async (client: SupabaseClient) => {
    const { data, error } = await client.from("cotos").select("id, name, slug").order("name");
    if (error) {
      console.error("[admin dashboard] cotos:", error);
      setCotos([]);
      return;
    }
    setCotos((data ?? []) as CotoRow[]);
  }, []);

  const loadProperties = useCallback(
    async (client: SupabaseClient, cotoId: string) => {
      setListLoading(true);
      try {
        const { data, error } = await client
          .from("properties")
          .select("id, coto_id, house_number, display_label, is_delinquent, created_at, updated_at")
          .eq("coto_id", cotoId)
          .order("house_number", { ascending: true });
        if (error) {
          console.error("[admin dashboard] properties:", error);
          setProperties([]);
          return;
        }
        setProperties((data ?? []) as PropertyRow[]);
      } finally {
        setListLoading(false);
      }
    },
    []
  );

  const tenantId = useMemo(() => effectiveCotoId(profile), [profile]);

  const propertyLookup = useMemo(() => {
    const m = new Map<string, { house_number: string; display_label: string | null }>();
    for (const p of properties) {
      m.set(p.id, { house_number: p.house_number, display_label: p.display_label });
    }
    return m;
  }, [properties]);

  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        setUserId(null);
        setProfile(null);
        setSessionReady(true);
        return;
      }
      setUserId(session.user.id);
      void loadProfile(supabase, session.user.id).finally(() => {
        if (!cancelled) setSessionReady(true);
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      if (!session?.user) {
        setUserId(null);
        setProfile(null);
        return;
      }
      setUserId(session.user.id);
      void loadProfile(supabase, session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  useEffect(() => {
    if (!supabase || !userId || !profile) return;
    if (profile.role === "admin") {
      void loadCotos(supabase);
    } else {
      setCotos([]);
    }
  }, [supabase, userId, profile, loadCotos]);

  useEffect(() => {
    if (!supabase || !tenantId) return;
    if (profile?.role !== "admin" && profile?.role !== "coto_admin") return;
    void loadProperties(supabase, tenantId);
  }, [supabase, tenantId, profile?.role, loadProperties]);

  useEffect(() => {
    if (!supabase || !tenantId) return;
    if (profile?.role !== "admin" && profile?.role !== "coto_admin") return;

    const channel = supabase
      .channel(`admin-properties:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter: `coto_id=eq.${tenantId}`,
        },
        () => {
          void loadProperties(supabase, tenantId);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[admin dashboard] Realtime:", status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, profile?.role, loadProperties]);

  const signIn = async () => {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProperties([]);
    setCotos([]);
    setProfile(null);
  };

  const setActiveCoto = async (cotoId: string) => {
    if (!supabase || !userId || profile?.role !== "admin") return;
    const { error } = await supabase
      .from("profiles")
      .update({ active_coto_id: cotoId, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      setAuthError(error.message);
      return;
    }
    await loadProfile(supabase, userId);
  };

  const toggleDelinquent = async (row: PropertyRow) => {
    if (!supabase) return;
    const next = !row.is_delinquent;
    setTogglingIds((s) => new Set(s).add(row.id));
    setAuthError(null);
    try {
      const { error } = await supabase
        .from("properties")
        .update({
          is_delinquent: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      setProperties((prev) => prev.map((p) => (p.id === row.id ? { ...p, is_delinquent: next } : p)));
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : "No se pudo actualizar la propiedad.");
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s);
        n.delete(row.id);
        return n;
      });
    }
  };

  if (!supabase || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-700">
        Cargando…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-zinc-50 px-6 py-12">
        <h1 className="text-2xl font-bold text-zinc-900">Admin — Morosidad por casa</h1>
        <p className="text-sm text-zinc-600">Inicia sesión con una cuenta con rol administrador del coto o superadmin.</p>
        <label className="block text-sm font-medium text-zinc-700">
          Correo
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          Contraseña
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
        <button
          type="button"
          onClick={() => void signIn()}
          className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-lg font-semibold text-red-700">Perfil no disponible</p>
        <p className="mt-2 text-zinc-600">{profileError ?? "Sin datos de perfil."}</p>
        <button type="button" onClick={() => void signOut()} className="mt-6 text-blue-600 underline">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (profile.role !== "admin" && profile.role !== "coto_admin") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-lg font-semibold text-amber-800">Acceso restringido</p>
        <p className="mt-2 text-zinc-600">
          Esta vista es solo para roles <code className="rounded bg-zinc-200 px-1">admin</code> o{" "}
          <code className="rounded bg-zinc-200 px-1">coto_admin</code>. Tu rol:{" "}
          <code className="rounded bg-zinc-100 px-1">{profile.role}</code>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-50"
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  const cotoLabel = cotos.find((c) => c.id === tenantId)?.name ?? "Coto actual";

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard — Casas y morosidad</h1>
            <p className="text-sm text-zinc-500">
              Coto: <span className="font-medium text-zinc-800">{cotoLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {profile.role === "admin" && cotos.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-zinc-600">Cambiar coto</span>
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-medium"
                  value={tenantId ?? ""}
                  onChange={(e) => void setActiveCoto(e.target.value)}
                >
                  {cotos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.slug ? ` (${c.slug})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-900"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {authError ? (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
            {authError}
          </p>
        ) : null}

        <p className="mb-6 text-sm text-zinc-600">
          Verde = al corriente. Rojo = moroso. Los cambios se guardan en Supabase y los residentes con Realtime en{" "}
          <code className="rounded bg-zinc-200 px-1">properties</code> verán el estado al instante.
        </p>

        {supabase && tenantId && propertyIds.length > 0 ? (
          <PendingPaymentsSection
            supabase={supabase}
            propertyIds={propertyIds}
            propertyLookup={propertyLookup}
            onPropertyUpdated={() => void loadProperties(supabase, tenantId)}
          />
        ) : null}

        <h2 className="mb-3 text-lg font-bold text-zinc-900">Casas del coto</h2>

        {listLoading && properties.length === 0 ? (
          <p className="text-zinc-500">Cargando propiedades…</p>
        ) : properties.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
            No hay casas registradas en este coto (tabla <code className="text-zinc-700">properties</code>).
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const busy = togglingIds.has(p.id);
              const ok = !p.is_delinquent;
              return (
                <li
                  key={p.id}
                  className={`flex flex-col rounded-xl border-2 p-4 shadow-sm transition-colors ${
                    ok ? "border-emerald-400 bg-emerald-50/90" : "border-red-500 bg-red-50/90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-zinc-900">Casa {p.house_number}</p>
                      {p.display_label ? (
                        <p className="text-sm text-zinc-600">{p.display_label}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold uppercase ${
                        ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                      }`}
                    >
                      {ok ? "OK" : "Mora"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-1 flex-col justify-end">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.is_delinquent}
                      disabled={busy}
                      onClick={() => void toggleDelinquent(p)}
                      className={`w-full rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-50 ${
                        ok ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {busy ? "Guardando…" : ok ? "Marcar en mora" : "Marcar al corriente"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
