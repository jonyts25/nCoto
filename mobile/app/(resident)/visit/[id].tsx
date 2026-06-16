import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { getVisitById } from "@/src/features/visits/repo";
import { buildVisitQrPayload, encodeVisitQrPayload } from "@/src/features/visits/qr";
import type { Visit } from "@/src/features/visits/types";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { colors } from "@/src/theme/colors";
import { formatVisitTimeRange, isVisitNotExpired } from "@/src/features/visits/validation";
import { Ionicons } from "@expo/vector-icons";

export default function ResidentVisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getVisitById(id).then((data) => {
        setVisit(data);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Pase" />
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Pase" />
        <Text style={styles.error}>Visita no encontrada</Text>
      </SafeAreaView>
    );
  }

  const qrPayload = encodeVisitQrPayload(buildVisitQrPayload(visit));
  const timeRange = formatVisitTimeRange(visit);
  const canEdit = isVisitNotExpired(visit);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader
        title="Pase de acceso"
        right={
          canEdit ? (
            <Pressable
              onPress={() => router.push(`/(resident)/visits?editId=${visit.id}` as any)}
              accessibilityLabel="Editar pase"
              hitSlop={12}
              style={styles.headerEdit}
            >
              <Ionicons name="create-outline" size={26} color={colors.primary} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.guestName}>{visit.guestName}</Text>
        <Text style={styles.status}>
          Tipo: {visit.visitType ?? "eventual"} · Estatus: {visit.status}
        </Text>
        {visit.validDay ? <Text style={styles.meta}>Día: {visit.validDay}</Text> : null}
        {timeRange ? <Text style={styles.meta}>Horario: {timeRange}</Text> : null}

        <View style={styles.qrContainer}>
          <QRCode value={qrPayload} size={220} color={colors.text} backgroundColor={colors.surface} />
        </View>

        <Text style={styles.instructions}>
          Comparte este código con tu invitado para que lo presente en caseta.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 40, alignItems: "center" },
  headerEdit: { padding: 6 },
  guestName: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 8 },
  status: { fontSize: 16, color: colors.textMuted, marginBottom: 8, textTransform: "capitalize" },
  meta: { fontSize: 15, color: colors.textMuted, marginBottom: 4 },
  qrContainer: {
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructions: { marginTop: 32, textAlign: "center", color: colors.textMuted, paddingHorizontal: 12, fontSize: 16 },
  error: { marginTop: 40, textAlign: "center", fontSize: 18, color: colors.danger },
});
