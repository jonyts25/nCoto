import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/features/auth/useAuth";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button } from "@/src/components/Button";
import { colors } from "@/src/theme/colors";
import {
  computeBalance,
  fetchCotoFinances,
  insertManualExpense,
  type CotoFinanceRow,
} from "@/src/features/board/treasuryRepo";

function formatMoney(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ResidentTreasuryScreen() {
  const router = useRouter();
  const { userRole, isLoading: authLoading } = useAuth();
  const { effectiveCotoId, scopeVersion } = useCotoScope();
  const kickRef = useRef<string | null>(null);
  const [rows, setRows] = useState<CotoFinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveCotoId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchCotoFinances(effectiveCotoId));
    } finally {
      setLoading(false);
    }
  }, [effectiveCotoId, scopeVersion]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (authLoading) return;
    if (userRole === "board_member") return;
    if (userRole == null) return;
    const key = `treasury-kick:${userRole}`;
    if (kickRef.current === key) return;
    kickRef.current = key;
    router.replace("/(resident)");
  }, [authLoading, userRole, router]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.kickWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.kickText}>Cargando…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (userRole !== "board_member") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.kickWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.kickText}>Volviendo…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = computeBalance(rows);

  const submitExpense = async () => {
    if (!effectiveCotoId) return;
    const amount = Number(amountStr.replace(",", "."));
    setSaving(true);
    const res = await insertManualExpense({ cotoId: effectiveCotoId, amount, description: desc });
    setSaving(false);
    if (res.error) {
      Alert.alert("No se pudo registrar", res.error);
      return;
    }
    setModalOpen(false);
    setAmountStr("");
    setDesc("");
    await load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Tesorería" />
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo acumulado</Text>
            <Text style={[styles.balanceValue, { color: balance >= 0 ? colors.success : colors.danger }]}>
              {formatMoney(balance)}
            </Text>
            <Text style={styles.balanceHint}>Ingresos por comprobantes aprobados menos egresos registrados.</Text>
          </View>

          <Button title="Registrar gasto" variant="primary" onPress={() => setModalOpen(true)} />

          <Text style={styles.sectionTitle}>Movimientos recientes</Text>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No hay movimientos en este coto.</Text>
          ) : (
            rows.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowType}>
                    {item.entry_type === "payment_income" ? "Ingreso" : "Egreso"}
                  </Text>
                  <Text
                    style={[
                      styles.rowAmt,
                      { color: item.entry_type === "payment_income" ? colors.success : colors.danger },
                    ]}
                  >
                    {item.entry_type === "payment_income" ? "+" : "−"}
                    {formatMoney(item.amount)}
                  </Text>
                </View>
                <Text style={styles.rowDesc}>{item.description}</Text>
                <Text style={styles.rowDate}>{formatWhen(item.created_at)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => !saving && setModalOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Registrar egreso</Text>
            <Text style={styles.label}>Monto (MXN)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0.00"
            />
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              multiline
              value={desc}
              onChangeText={setDesc}
              placeholder="Ej. Pago de jardinería marzo"
            />
            <View style={styles.sheetActions}>
              <Button title="Cancelar" variant="outline" onPress={() => setModalOpen(false)} disabled={saving} />
              <Button title="Guardar" variant="primary" onPress={() => void submitExpense()} loading={saving} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 48 },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  balanceValue: { fontSize: 28, fontWeight: "800", marginTop: 8 },
  balanceHint: { fontSize: 13, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 24, marginBottom: 12 },
  empty: { color: colors.textMuted, fontSize: 15 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowType: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  rowAmt: { fontSize: 16, fontWeight: "800" },
  rowDesc: { fontSize: 15, color: colors.text, marginTop: 6 },
  rowDate: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  modalRoot: { flex: 1, justifyContent: "center", padding: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 16, color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: "#fff",
  },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 8, justifyContent: "flex-end" },
  kickWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  kickText: { marginTop: 12, fontSize: 15, color: colors.textMuted },
});
