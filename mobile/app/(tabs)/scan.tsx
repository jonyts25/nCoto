import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { AppButton } from "@/src/components/AppButton";
import { getVisitById, markVisitUsed } from "@/src/features/visits/repo";

type VisitQrPayloadV1 = {
  v: 1;
  visitId: string;
  validUntil: string;
  createdAt: string;
};

function parsePayload(raw: string): VisitQrPayloadV1 | null {
  try {
    const obj = JSON.parse(raw);
    if (obj?.v === 1 && typeof obj.visitId === "string" && typeof obj.validUntil === "string") {
      return obj as VisitQrPayloadV1;
    }
    return null;
  } catch {
    return null;
  }
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false); // evita escaneo múltiple
  const [message, setMessage] = useState<string>("Apunta al QR de la visita.");

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) setMessage("Necesitamos permiso de cámara para escanear.");
  }, [permission]);

  const canScan = useMemo(() => permission?.granted && !locked, [permission, locked]);

  async function onBarcodeScanned(data: string) {
    if (!canScan) return;
    setLocked(true);

    const payload = parsePayload(data);
    if (!payload) {
      setMessage("❌ QR inválido (no es NCoto v1).");
      Alert.alert("QR inválido", "Este QR no corresponde a una visita de NCoto.");
      setLocked(false);
      return;
    }

    // valida vigencia
    const now = Date.now();
    const validUntilMs = Date.parse(payload.validUntil);
    if (Number.isNaN(validUntilMs) || validUntilMs < now) {
      setMessage("❌ Visita expirada.");
      Alert.alert("Rechazado", "La visita está expirada.");
      setLocked(false);
      return;
    }

    // valida existencia
    const visit = await getVisitById(payload.visitId);
    if (!visit) {
      setMessage("❌ No existe esa visita en este dispositivo.");
      Alert.alert("Rechazado", "No encontramos esa visita.");
      setLocked(false);
      return;
    }

    // valida estado
    if (visit.status !== "active") {
      setMessage(`❌ Visita no activa (estado: ${visit.status}).`);
      Alert.alert("Rechazado", "La visita ya fue usada o no está activa.");
      setLocked(false);
      return;
    }

    // ok → marcar usada
    await markVisitUsed(visit.id);
    setMessage("✅ Acceso permitido. Visita marcada como usada.");
    Alert.alert("Acceso permitido", "Visita marcada como usada.");

    // deja desbloqueo manual para el siguiente escaneo
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
        <Text>Cargando permisos...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Escanear</Text>
        <Text>{message}</Text>
        <AppButton title="Dar permiso de cámara" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onBarcodeScanned(data)}
      />

      <View style={{ padding: 16, gap: 10, backgroundColor: "white" }}>
        <Text style={{ fontWeight: "700" }}>Resultado</Text>
        <Text>{message}</Text>

        <Pressable onPress={() => { setLocked(false); setMessage("Apunta al QR de la visita."); }}>
          <Text style={{ color: "#666" }}>Escanear otro</Text>
        </Pressable>
      </View>
    </View>
  );
}
