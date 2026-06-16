"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import {
  approvePaymentSubmission,
  createSignedProofUrl,
  fetchPendingPaymentSubmissions,
  rejectPaymentSubmission,
  type PaymentSubmissionRow,
} from "@/lib/admin/paymentsRepo";

type PropertyLookup = { house_number: string; display_label: string | null };

type Props = {
  supabase: SupabaseClient;
  propertyIds: string[];
  propertyLookup: Map<string, PropertyLookup>;
  onPropertyUpdated: () => void;
};

export function PendingPaymentsSection({ supabase, propertyIds, propertyLookup, onPropertyUpdated }: Props) {
  const [rows, setRows] = useState<PaymentSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PaymentSubmissionRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    if (!propertyIds.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchPendingPaymentSubmissions(supabase, propertyIds));
    } finally {
      setLoading(false);
    }
  }, [supabase, propertyIds]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!selected) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    setImageLoading(true);
    setImageUrl(null);
    void createSignedProofUrl(supabase, selected.image_url).then((url) => {
      if (!cancelled) {
        setImageUrl(url);
        setImageLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, selected]);

  const closeModal = () => {
    setSelected(null);
    setRejectNote("");
    setLocalError(null);
  };

  const onApprove = async () => {
    if (!selected) return;
    setActionBusy(true);
    setLocalError(null);
    const { error } = await approvePaymentSubmission(supabase, selected.id, selected.property_id);
    setActionBusy(false);
    if (error) {
      setLocalError(error);
      return;
    }
    closeModal();
    await loadPending();
    onPropertyUpdated();
  };

  const onReject = async () => {
    if (!selected) return;
    const note = rejectNote.trim();
    if (note.length < 3) {
      setLocalError("Escribe una nota breve (mín. 3 caracteres) explicando el rechazo.");
      return;
    }
    setActionBusy(true);
    setLocalError(null);
    const { error } = await rejectPaymentSubmission(supabase, selected.id, note);
    setActionBusy(false);
    if (error) {
      setLocalError(error);
      return;
    }
    closeModal();
    await loadPending();
  };

  if (!propertyIds.length) return null;

  return (
    <section className="mb-12 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-bold text-zinc-900">Pagos pendientes</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Comprobantes enviados por residentes. Haz clic para ver la imagen y aprobar o rechazar.
      </p>

      {localError && !selected ? (
        <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{localError}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando solicitudes…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay comprobantes pendientes de revisión.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
          {rows.map((r) => {
            const prop = propertyLookup.get(r.property_id);
            const house = prop?.house_number ?? r.property_id.slice(0, 8);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => {
                    setLocalError(null);
                    setSelected(r);
                    setRejectNote("");
                  }}
                >
                  <div>
                    <p className="font-semibold text-zinc-900">Casa {house}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleString()}
                      {r.amount != null ? ` · Monto declarado: ${r.amount}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-blue-600">Ver detalle →</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="payment-modal-title" className="text-lg font-bold text-zinc-900">
              Revisar comprobante
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Casa {propertyLookup.get(selected.property_id)?.house_number ?? selected.property_id.slice(0, 8)} ·{" "}
              {new Date(selected.created_at).toLocaleString()}
            </p>

            <div className="mt-4 flex min-h-[200px] items-center justify-center rounded-lg bg-zinc-100">
              {imageLoading ? (
                <p className="text-sm text-zinc-500">Cargando imagen…</p>
              ) : imageUrl ? (
                <img src={imageUrl} alt="Comprobante" className="max-h-[55vh] w-full object-contain" />
              ) : (
                <p className="text-sm text-red-600">No se pudo obtener la imagen (permisos o ruta).</p>
              )}
            </div>

            {localError ? <p className="mt-3 text-sm text-red-700">{localError}</p> : null}

            <label className="mt-4 block text-sm font-medium text-zinc-700">
              Nota para rechazo (obligatoria si rechazas)
              <textarea
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Ej. El comprobante no coincide con el monto del recibo oficial."
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void onApprove()}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Aprobar (marca casa al corriente)
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void onReject()}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Rechazar con nota
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={closeModal}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
