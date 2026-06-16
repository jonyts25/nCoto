import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/features/auth/useAuth";
import { supabase } from "@/src/lib/supabase";
import { colors } from "@/src/theme/colors";
import {
  listMyPaymentSubmissions,
  uploadPaymentProofAndCreateSubmission,
  type PaymentSubmissionRow,
} from "@/src/features/payments/repo";
import { useFocusEffect } from "expo-router";

function statusLabel(s: PaymentSubmissionRow["status"]): string {
  switch (s) {
    case "pending":
      return "Pendiente";
    case "approved":
      return "Aprobado";
    case "rejected":
      return "Rechazado";
    default:
      return s;
  }
}

export default function ResidentPaymentsScreen() {
  const { session, profile } = useAuth();
  const [amountText, setAmountText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<PaymentSubmissionRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      setRows(await listMyPaymentSubmissions());
    } finally {
      setListLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadList();
    }, [loadList])
  );

  const pickAndUpload = async () => {
    if (!session?.user?.id || !profile?.property_id) {
      Alert.alert(
        "Sin unidad",
        "Tu cuenta no tiene una propiedad vinculada (property_id). Contacta a administración."
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso", "Se necesita acceso a la galería para adjuntar el comprobante.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    const amt = amountText.trim() ? Number(amountText.replace(",", ".")) : null;
    if (amountText.trim() && (amt == null || Number.isNaN(amt))) {
      Alert.alert("Monto", "Introduce un número válido o deja el monto vacío.");
      return;
    }

    setUploading(true);
    try {
      await uploadPaymentProofAndCreateSubmission({
        userId: session.user.id,
        propertyId: profile.property_id,
        imageUri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        amount: amt,
      });
      setAmountText("");
      Alert.alert("Listo", "Tu comprobante se envió. Administración lo revisará pronto.");
      await loadList();
    } catch (e: unknown) {
      console.error(e);
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo subir el comprobante.");
    } finally {
      setUploading(false);
    }
  };

  const hasProperty = Boolean(profile?.property_id);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader title="Comprobantes de pago" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Sube una foto del comprobante (transferencia, depósito, etc.). Opcionalmente indica el monto.
        </Text>

        {!hasProperty ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>No hay propiedad vinculada a tu perfil; no puedes enviar comprobantes.</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Monto pagado (opcional)</Text>
        <TextInput
          style={styles.input}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="Ej. 1500.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          editable={hasProperty && !uploading}
        />

        {uploading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <Button
            title="Elegir imagen y enviar"
            variant="primary"
            minHeight={52}
            disabled={!hasProperty}
            onPress={() => void pickAndUpload()}
          />
        )}

        <Text style={styles.sectionTitle}>Mis envíos</Text>
        {listLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Aún no has enviado comprobantes.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowStatus}>{statusLabel(r.status)}</Text>
                <Text style={styles.rowDate}>{new Date(r.created_at).toLocaleString()}</Text>
                {r.amount != null ? <Text style={styles.rowMeta}>Monto: {r.amount}</Text> : null}
                {r.status === "rejected" && r.admin_notes ? (
                  <Text style={styles.rowNote}>Nota: {r.admin_notes}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 48, gap: 8 },
  intro: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 8 },
  warnBox: {
    backgroundColor: "rgba(230, 57, 70, 0.12)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  warnText: { color: colors.danger, fontWeight: "600" },
  label: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
    color: colors.text,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 28, marginBottom: 8 },
  empty: { color: colors.textMuted, fontSize: 15, marginTop: 8 },
  row: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  rowStatus: { fontSize: 16, fontWeight: "800", color: colors.text },
  rowDate: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  rowMeta: { fontSize: 14, color: colors.text, marginTop: 4 },
  rowNote: { fontSize: 14, color: colors.danger, marginTop: 8, fontWeight: "600" },
});
