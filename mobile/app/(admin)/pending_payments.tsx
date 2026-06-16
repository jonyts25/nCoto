import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/features/auth/useAuth";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { colors } from "@/src/theme/colors";
import {
  approvePaymentSubmission,
  createSignedProofUrl,
  fetchPendingPaymentSubmissions,
  rejectPaymentSubmission,
  type PaymentSubmissionRow,
} from "@/src/features/admin/paymentsRepo";
import { fetchPropertiesForCoto, type AdminPropertyRow } from "@/src/features/admin/propertiesRepo";
import { formatHouseLabel } from "@/src/features/properties/formatHouseLabel";

export default function AdminPendingPaymentsScreen() {
  const router = useRouter();
  const { userRole, isLoading: authLoading } = useAuth();
  const { effectiveCotoId, scopeVersion } = useCotoScope();
  const kickRef = useRef<string | null>(null);
  const [properties, setProperties] = useState<AdminPropertyRow[]>([]);
  const [rows, setRows] = useState<PaymentSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PaymentSubmissionRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canView = userRole === "admin" || userRole === "coto_admin";

  const propertyLookup = useMemo(() => {
    const m = new Map<string, { house_number: string }>();
    for (const p of properties) {
      m.set(p.id, { house_number: p.house_number });
    }
    return m;
  }, [properties]);

  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties]);

  const loadProps = useCallback(async () => {
    if (!effectiveCotoId || !canView) {
      setProperties([]);
      return;
    }
    setProperties(await fetchPropertiesForCoto(effectiveCotoId));
  }, [effectiveCotoId, canView, scopeVersion]);

  const loadPending = useCallback(async () => {
    if (!propertyIds.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchPendingPaymentSubmissions(propertyIds));
    } finally {
      setLoading(false);
    }
  }, [propertyIds]);

  useEffect(() => {
    void loadProps();
  }, [loadProps]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (authLoading) return;
    if (canView) return;
    const key = `payments-kick:${userRole ?? "null"}`;
    if (kickRef.current === key) return;
    kickRef.current = key;
    router.replace("/");
  }, [authLoading, canView, userRole, router]);

  useEffect(() => {
    if (!selected) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    setImageLoading(true);
    setImageUrl(null);
    void createSignedProofUrl(selected.image_url).then((url) => {
      if (!cancelled) {
        setImageUrl(url);
        setImageLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const closeModal = () => {
    setSelected(null);
    setRejectNote("");
    setLocalError(null);
    setFullscreen(false);
  };

  const onApprove = async () => {
    if (!selected) return;
    setActionBusy(true);
    setLocalError(null);
    const { error } = await approvePaymentSubmission(selected.id, selected.property_id);
    setActionBusy(false);
    if (error) {
      setLocalError(error);
      return;
    }
    closeModal();
    await loadProps();
    await loadPending();
  };

  const onReject = async () => {
    if (!selected) return;
    const note = rejectNote.trim();
    if (note.length < 3) {
      setLocalError("Escribe una nota breve (mín. 3 caracteres) para el rechazo.");
      return;
    }
    setActionBusy(true);
    setLocalError(null);
    const { error } = await rejectPaymentSubmission(selected.id, note);
    setActionBusy(false);
    if (error) {
      setLocalError(error);
      return;
    }
    closeModal();
    await loadPending();
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.kickWrap}>
          <ActivityIndicator size="large" color={colors.success} />
          <Text style={styles.kickText}>Volviendo al inicio…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Pagos pendientes" />
      {loading && rows.length === 0 ? (
        <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {propertyIds.length === 0
                ? "No hay propiedades en este coto para revisar comprobantes."
                : "No hay comprobantes pendientes."}
            </Text>
          }
          renderItem={({ item }) => {
            const prop = propertyLookup.get(item.property_id);
            const houseLabel = prop?.house_number
              ? formatHouseLabel(prop.house_number)
              : `Casa: ${item.property_id.slice(0, 8)}`;
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  setLocalError(null);
                  setSelected(item);
                  setRejectNote("");
                  setFullscreen(false);
                }}
              >
                <Text style={styles.rowTitle}>{houseLabel}</Text>
                <Text style={styles.rowSub}>
                  {new Date(item.created_at).toLocaleString("es-MX")}
                  {item.amount != null ? ` · Monto: ${item.amount}` : ""}
                </Text>
                <Text style={styles.rowHint}>Toca para revisar</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => !actionBusy && closeModal()} />
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Revisar comprobante</Text>
              {selected ? (
                <Text style={styles.sheetSub}>
                  {(() => {
                    const hn = propertyLookup.get(selected.property_id)?.house_number;
                    return hn ? formatHouseLabel(hn) : "Casa: —";
                  })()}{" "}
                  · {new Date(selected.created_at).toLocaleString("es-MX")}
                </Text>
              ) : null}

              <Pressable
                onPress={() => imageUrl && !imageLoading && setFullscreen(true)}
                style={styles.imageBox}
              >
                {imageLoading ? (
                  <ActivityIndicator />
                ) : imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <Text style={styles.imageErr}>No se pudo cargar la imagen.</Text>
                )}
              </Pressable>
              <Text style={styles.tapHint}>Toca la imagen para verla en pantalla completa</Text>

              {localError ? <Text style={styles.err}>{localError}</Text> : null}

              <Text style={styles.label}>Nota si rechazas (obligatoria)</Text>
              <TextInput
                style={styles.textarea}
                multiline
                value={rejectNote}
                onChangeText={setRejectNote}
                placeholder="Motivo del rechazo…"
              />

              <View style={styles.actions}>
                <Button title="Aprobar" variant="primary" onPress={() => void onApprove()} loading={actionBusy} />
                <Button title="Rechazar" variant="danger" onPress={() => void onReject()} loading={actionBusy} />
                <Button title="Cerrar" variant="outline" onPress={closeModal} disabled={actionBusy} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={fullscreen && !!imageUrl} transparent animationType="fade">
        <Pressable style={styles.fsRoot} onPress={() => setFullscreen(false)}>
          <Text style={styles.fsHint}>Toca fuera para cerrar</Text>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.fsImage} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  listPad: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 32, fontSize: 15 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  rowHint: { fontSize: 13, color: colors.primary, marginTop: 8, fontWeight: "600" },
  modalRoot: { flex: 1, justifyContent: "center", padding: 12 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    maxHeight: "90%",
    zIndex: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: 12 },
  imageBox: {
    minHeight: 220,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  thumb: { width: "100%", height: 280 },
  imageErr: { color: colors.danger, padding: 16 },
  tapHint: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 8 },
  err: { color: colors.danger, marginTop: 10, fontSize: 14 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 14, color: colors.text },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 80,
    marginTop: 6,
    textAlignVertical: "top",
  },
  actions: { gap: 10, marginTop: 16 },
  fsRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", padding: 12 },
  fsHint: { color: "#fff", textAlign: "center", marginBottom: 12, fontSize: 14 },
  fsImage: { width: "100%", minHeight: 400, flexGrow: 1 },
  kickWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  kickText: { marginTop: 12, fontSize: 15, color: colors.textMuted },
});
