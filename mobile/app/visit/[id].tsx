import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { AppButton } from "@/src/components/AppButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { getVisitById, markVisitUsed } from "@/src/features/visits/repo";
import type { Visit } from "@/src/features/visits/types";
import { buildVisitQrPayload, encodeVisitQrPayload } from "@/src/features/visits/qr";
import { colors } from "@/src/theme/colors";

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const v = await getVisitById(String(id));
      setVisit(v);
      setLoading(false);
    })();
  }, [id]);

  const qrValue = useMemo(() => {
    if (!visit) return "";
    const payload = buildVisitQrPayload(visit);
    return encodeVisitQrPayload(payload);
  }, [visit]);

  async function onMarkUsed() {
    if (!visit) return;
    await markVisitUsed(visit.id);
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Detalle de visita" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Detalle de visita" />
        <View style={styles.centered}>
          <Text style={styles.notFound}>No encontrada</Text>
          <AppButton title="Volver" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Detalle de visita" }} />
      <ScreenHeader title="Detalle de visita" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.guest}>{visit.guestName}</Text>
        {!!visit.plates && <Text style={styles.meta}>Placas: {visit.plates}</Text>}
        {!!visit.note && <Text style={styles.meta}>Nota: {visit.note}</Text>}

        <Text style={styles.meta}>Vigencia: {new Date(visit.validUntil).toLocaleString()}</Text>
        <Text style={styles.meta}>Tipo: {visit.visitType ?? "eventual"}</Text>
        <Text style={styles.meta}>Estado: {visit.status}</Text>

        <View style={styles.qrWrap}>
          <View style={styles.qrBox}>
            <QRCode value={qrValue} size={220} color={colors.text} backgroundColor={colors.surface} />
          </View>
          <Text style={styles.qrHint}>
            QR (v2): tipo, visitId, vigencia y día autorizado cuando aplica.
          </Text>
        </View>

        {visit.status === "active" && (
          <View style={{ marginTop: 16 }}>
            <AppButton title="Marcar como usada" onPress={onMarkUsed} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 },
  scroll: { padding: 16, paddingBottom: 32, gap: 8 },
  guest: { fontSize: 20, fontWeight: "800", color: colors.text },
  meta: { fontSize: 15, color: colors.textMuted },
  notFound: { fontSize: 18, fontWeight: "700", color: colors.text },
  qrWrap: { alignItems: "center", marginTop: 12 },
  qrBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  qrHint: { color: colors.textMuted, marginTop: 10, textAlign: "center", fontSize: 14, paddingHorizontal: 8 },
});
