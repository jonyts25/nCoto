"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeVisitQrPayload } from "@/lib/visits/qrDecode";
import {
  fetchProfileRole,
  listTodaysVisitsForGuard,
  loadVisitForSecurityScreen,
  markVisitUsed,
  peekVisitResidentIsDelinquent,
  updateVisitGuardFields,
} from "@/lib/visits/securityRepo";
import type { Visit } from "@/lib/visits/types";
import { canValidateVisitNow, formatLocalDateISO } from "@/lib/visits/validation";

function isTypingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en web/.env.local");
  }
  return createClient(url, key);
}

export function GuardScanClient() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [lastScanLine, setLastScanLine] = useState("");
  const bufferRef = useRef("");

  const [todaysVisits, setTodaysVisits] = useState<Visit[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [scannedVisit, setScannedVisit] = useState<Visit | null>(null);
  const [blockedVisit, setBlockedVisit] = useState<Visit | null>(null);
  const [delinquent, setDelinquent] = useState(false);
  const [delinquentCheckError, setDelinquentCheckError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [plates, setPlates] = useState("");
  const [note, setNote] = useState("");

  const refreshList = useCallback(async () => {
    if (!supabase) return;
    setListLoading(true);
    try {
      const list = await listTodaysVisitsForGuard(supabase);
      setTodaysVisits(list);
    } finally {
      setListLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    setSupabase(createBrowserSupabase());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        setSessionReady(true);
        setUserId(null);
        setRole(null);
        return;
      }
      setUserId(session.user.id);
      void fetchProfileRole(supabase, session.user.id).then(({ role: r, error }) => {
        if (cancelled) return;
        setRole(r);
        if (error) setAuthError(error);
        setSessionReady(true);
      });
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      if (!session?.user) {
        setUserId(null);
        setRole(null);
        return;
      }
      setUserId(session.user.id);
      void fetchProfileRole(supabase, session.user.id).then(({ role: r }) => {
        if (cancelled) return;
        setRole(r);
      });
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    if (role !== "guard" || !userId) {
      setListLoading(false);
      return;
    }
    void refreshList();
  }, [supabase, role, userId, refreshList]);

  const resetScanState = useCallback(() => {
    setScannedVisit(null);
    setBlockedVisit(null);
    setDelinquent(false);
    setDelinquentCheckError(null);
    setScanError(null);
    setPlates("");
    setNote("");
  }, []);

  const processVisitId = useCallback(
    async (visitId: string) => {
      if (!supabase) return;
      setProcessing(true);
      setScanError(null);
      setDelinquentCheckError(null);
      setDelinquent(false);
      setBlockedVisit(null);
      setScannedVisit(null);

      try {
        const load = await loadVisitForSecurityScreen(supabase, visitId);
        if (load.kind !== "ok") {
          const msg =
            load.kind === "not_found"
              ? "Pase no encontrado."
              : load.kind === "rls_denied"
                ? "Sin acceso a este pase."
                : load.kind === "rpc_unavailable"
                  ? "Servidor sin función de seguridad (peek_visit_exists_for_security)."
                  : load.kind === "error"
                    ? load.message
                    : "Error al cargar el pase.";
          setScanError(msg);
          return;
        }

        const validation = canValidateVisitNow(load.visit);
        if (!validation.ok) {
          setScanError(validation.reason);
          return;
        }

        const mora = await peekVisitResidentIsDelinquent(supabase, visitId);
        if (mora.error) {
          setDelinquentCheckError(mora.error);
        }
        if (Boolean(mora.delinquent)) {
          setDelinquent(true);
          setBlockedVisit(load.visit);
          setScannedVisit(null);
          setPlates("");
          setNote("");
          return;
        }
        setDelinquent(false);
        setBlockedVisit(null);
        setPlates(load.visit.plates ?? "");
        setNote(load.visit.note ?? "");
        setScannedVisit(load.visit);
      } finally {
        setProcessing(false);
      }
    },
    [supabase]
  );

  const processRawScan = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const decoded = decodeVisitQrPayload(trimmed);
      const visitId = decoded?.visitId ?? null;
      if (!visitId) {
        setScanError("QR no válido (no es un pase NCoto).");
        return;
      }
      void processVisitId(visitId);
    },
    [processVisitId]
  );

  useEffect(() => {
    if (!supabase || role !== "guard") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField(e.target)) return;

      if (e.key === "Enter") {
        const line = bufferRef.current;
        bufferRef.current = "";
        setLastScanLine(line.trim().slice(0, 500));
        if (line.trim()) processRawScan(line);
        e.preventDefault();
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key;
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [supabase, role, processRawScan]);

  const handleConfirmAccess = useCallback(async () => {
    if (!supabase || !scannedVisit || delinquent) return;
    setProcessing(true);
    setScanError(null);
    try {
      await updateVisitGuardFields(supabase, scannedVisit.id, {
        plates,
        note,
      });
      await markVisitUsed(supabase, scannedVisit.id);
      resetScanState();
      await refreshList();
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Error al registrar acceso.");
    } finally {
      setProcessing(false);
    }
  }, [scannedVisit, delinquent, plates, note, supabase, resetScanState, refreshList]);

  const todayLabel = formatLocalDateISO(new Date());

  const login = async () => {
    if (!supabase) return;
    const email = window.prompt("Email (cuenta guardia)");
    const password = window.prompt("Contraseña");
    if (!email?.trim() || !password) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) alert(error.message);
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    resetScanState();
  };

  if (!supabase || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-700">
        Cargando sesión…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 bg-zinc-100 px-6 py-16">
        <h1 className="text-2xl font-bold text-zinc-900">Caseta — escaneo QR</h1>
        <p className="text-zinc-600">Inicia sesión con una cuenta con rol guardia.</p>
        <button
          type="button"
          onClick={() => void login()}
          className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (role !== "guard") {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 bg-amber-50 px-6 py-16">
        <h1 className="text-2xl font-bold text-amber-950">Acceso denegado</h1>
        <p className="text-amber-900">
          Esta pantalla solo está disponible para usuarios con rol <strong>guard</strong>. Tu rol actual:{" "}
          <code className="rounded bg-amber-100 px-1">{role ?? "—"}</code>
        </p>
        {authError ? <p className="text-sm text-red-700">{authError}</p> : null}
        <button type="button" onClick={() => void logout()} className="rounded-lg border border-amber-800 px-4 py-2">
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      {delinquent && blockedVisit ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-red-800 p-8 text-center text-white shadow-2xl"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={(e) => e.preventDefault()}
        >
          <p className="max-w-[95vw] text-center text-3xl font-black uppercase leading-tight tracking-wide text-yellow-200 sm:text-5xl md:text-6xl">
            ACCESO DENEGADO - CONTACTAR ADMINISTRACIÓN
          </p>
          <p className="text-lg opacity-90">
            Unidad en mora. Visitante: {blockedVisit.guestName} · Pase {blockedVisit.id.slice(0, 8)}…
          </p>
          <p className="max-w-md text-sm leading-relaxed text-white/90">
            El ingreso queda bloqueado. Esta alerta no se puede descartar: solo puedes recargar la página para volver a
            operar en caseta. Contacta a administración por el adeudo del residente titular del pase.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-white px-8 py-3 text-lg font-bold text-red-800 hover:bg-zinc-100"
          >
            Recargar página
          </button>
        </div>
      ) : null}

      <header className="border-b border-zinc-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Caseta — lectura QR USB</h1>
            <p className="text-sm text-zinc-500">
              El lector envía el código como teclado; no hace falta enfocar un campo. Hoy: {todayLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
              Guardia
            </span>
            <button
              type="button"
              onClick={() => void refreshList()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Actualizar lista
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Último escaneo (buffer)</h2>
          <p className="mb-3 font-mono text-xs break-all text-zinc-600">{lastScanLine || "—"}</p>
          {processing ? <p className="text-sm text-blue-600">Procesando…</p> : null}
          {scanError ? (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="status">
              {scanError}
            </p>
          ) : null}
          {delinquentCheckError && !delinquent ? (
            <p className="mt-2 text-sm text-amber-800">Aviso morosidad: {delinquentCheckError}</p>
          ) : null}

          {scannedVisit && !delinquent ? (
            <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
              <h3 className="font-semibold text-emerald-800">Pase válido — completar datos</h3>
              <p className="text-sm">
                <span className="font-medium">{scannedVisit.guestName}</span> ·{" "}
                {scannedVisit.visitType} · hasta {new Date(scannedVisit.validUntil).toLocaleString()}
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Placas / identificación</span>
                <span className="mb-2 block text-xs text-zinc-500">
                  Puedes editar las placas aquí si el vehículo cambió respecto al pase.
                </span>
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                  value={plates}
                  onChange={(e) => setPlates(e.target.value)}
                  placeholder="Ej. ABC-123-D"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Nota (opcional)</span>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={processing || delinquent}
                  onClick={() => void handleConfirmAccess()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Registrar ingreso (mark_visit_used)
                </button>
                <button type="button" onClick={resetScanState} className="rounded-lg border border-zinc-300 px-4 py-2">
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Visitas previstas hoy</h2>
          {listLoading ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : todaysVisits.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay pases activos listados para hoy en este coto.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto">
              {todaysVisits.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{v.guestName}</p>
                    <p className="text-xs text-zinc-500">
                      {v.visitType}
                      {v.validDay ? ` · día ${v.validDay}` : ""} · hasta{" "}
                      {new Date(v.validUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-blue-600 hover:underline"
                    onClick={() => void processVisitId(v.id)}
                  >
                    Simular escaneo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-zinc-400">
        Morosidad vía <code className="rounded bg-zinc-200 px-1">peek_visit_resident_is_delinquent</code> y tabla{" "}
        <code className="rounded bg-zinc-200 px-1">properties</code>. El residente usa{" "}
        <code className="rounded bg-zinc-200 px-1">current_user_property_is_delinquent()</code> en RLS propio.
      </footer>
    </div>
  );
}
