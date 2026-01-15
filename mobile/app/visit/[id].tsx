import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import QRCode from "react-native-qrcode-svg";

import { AppButton } from "@/src/components/AppButton";
import { getVisitById, markVisitUsed } from "@/src/features/visits/repo";
import type { Visit } from "@/src/features/visits/types";
import { buildVisitQrPayload, encodeVisitQrPayload } from "@/src/features/visits/qr";

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!visit) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>No encontrada</Text>
        <AppButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Detalle de visita" }} />

      <Text style={{ fontSize: 20, fontWeight: "800" }}>{visit.guestName}</Text>
      {!!visit.plates && <Text>Placas: {visit.plates}</Text>}
      {!!visit.note && <Text>Nota: {visit.note}</Text>}

      <Text style={{ color: "#666" }}>
        Vigencia: {new Date(visit.validUntil).toLocaleString()}
      </Text>
      <Text style={{ color: "#666" }}>Estado: {visit.status}</Text>

      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View style={{ padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 16 }}>
          <QRCode value={qrValue} size={220} />
        </View>

        <Text style={{ color: "#666", marginTop: 10, textAlign: "center" }}>
          QR incluye: visitId + validUntil + createdAt (payload v1)
        </Text>
      </View>

      {visit.status === "active" && (
        <View style={{ marginTop: 12 }}>
          <AppButton title="Marcar como usada" onPress={onMarkUsed} />
        </View>
      )}
    </View>
  );
}
