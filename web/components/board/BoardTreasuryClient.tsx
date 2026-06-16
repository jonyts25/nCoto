"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeBalance,
  fetchCotoFinances,
  insertManualExpense,
  type CotoFinanceRow,
} from "@/lib/board/treasuryRepo";

function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en web/.env.local");
  }
  return createClient(url, key);
}

type ProfileRow = {
  role: string;
  coto_id: string;
  active_coto_id: string | null;
};

export function BoardTreasuryClient() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [rows, setRows] = useState<CotoFinanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expSaving, setExpSaving] = useState(false);

  useEffect(() => {
    setSupabase(createBrowserSupabase());
  }, []);

  const loadProfile = useCallback(async (client: SupabaseClient, uid: string) => {
    const { data, error } = await client
      .from("profiles")
      .select("role, coto_id, active_coto_id")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) {
      setProfile(null);
      setProfileError(error?.message ?? "Sin perfil");
      return;
    }
    setProfileError(null);
    setProfile(data as ProfileRow);
  }, []);

  const cotoIdForBoard = useMemo(() => {
    if (!profile?.coto_id) return null;
    return profile.coto_id;
  }, [profile]);

  const loadFinances = useCallback(async () => {
    if (!supabase || !cotoIdForBoard) return;
    setLoading(true);
    try {
      setRows(await fetchCotoFinances(supabase, cotoIdForBoard));
    } finally {
      setLoading(false);
    }
  }, [supabase, cotoIdForBoard]);

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
    if (!supabase || !cotoIdForBoard || profile?.role !== "board_member") return;
    void loadFinances();
  }, [supabase, cotoIdForBoard, profile?.role, loadFinances]);

  const balance = useMemo(() => computeBalance(rows), [rows]);

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
    setRows([]);
    setProfile(null);
  };

  const submitExpense = async () => {
    if (!supabase || !cotoIdForBoard) return;
    const amt = Number(expAmount.replace(",", "."));
    setExpSaving(true);
    setAuthError(null);
    const { error } = await insertManualExpense(supabase, {
      cotoId: cotoIdForBoard,
      amount: amt,
      description: expDesc,
    });
    setExpSaving(false);
    if (error) {
      setAuthError(error);
      return;
    }
    setExpAmount("");
    setExpDesc("");
    await loadFinances();
  };

  if (!supabase || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        Cargando…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-slate-50 px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">Tesorería — Mesa directiva</h1>
        <p className="text-sm text-slate-600">Inicia sesión con tu cuenta de mesa directiva.</p>
        <label className="block text-sm font-medium text-slate-700">
          Correo
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Contraseña
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
        <button
          type="button"
          onClick={() => void signIn()}
          className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700"
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
        <p className="mt-2 text-slate-600">{profileError ?? "Sin datos."}</p>
        <button type="button" onClick={() => void signOut()} className="mt-6 text-indigo-600 underline">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (profile.role !== "board_member") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-lg font-semibold text-amber-900">Acceso solo para mesa directiva</p>
        <p className="mt-2 text-slate-600">
          Esta vista es exclusiva del rol <code className="rounded bg-slate-200 px-1">board_member</code>. Tu rol
          actual: <code className="rounded bg-slate-100 px-1">{profile.role}</code>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Tesorería</h1>
            <p className="text-sm text-slate-500">Transparencia financiera del coto (vista mesa directiva)</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-900">Saldo acumulado estimado</p>
          <p className="mt-2 text-4xl font-black text-emerald-950">
            {loading && rows.length === 0 ? "…" : balance.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
          </p>
          <p className="mt-2 text-xs text-emerald-800">
            Suma de ingresos por comprobantes aprobados menos egresos registrados. No sustituye el libro contable
            oficial.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Registrar egreso manual</h2>
          <p className="mt-1 text-sm text-slate-500">Queda auditado con tu usuario y fecha.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Monto
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="Ej. 2500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Concepto
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Ej. Mantenimiento áreas comunes — Factura 123"
              />
            </label>
          </div>
          {authError ? <p className="mt-3 text-sm text-red-600">{authError}</p> : null}
          <button
            type="button"
            disabled={expSaving}
            onClick={() => void submitExpense()}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {expSaving ? "Guardando…" : "Registrar egreso"}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Movimientos</h2>
          {loading && rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Aún no hay movimientos registrados en este coto.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{r.description}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString()} ·{" "}
                      {r.entry_type === "payment_income" ? "Ingreso (comprobante)" : "Egreso manual"}
                    </p>
                  </div>
                  <p
                    className={`text-right text-lg font-bold ${
                      r.entry_type === "payment_income" ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {r.entry_type === "payment_income" ? "+" : "−"}
                    {r.amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
