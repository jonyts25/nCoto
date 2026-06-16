import React, { useState, useEffect } from "react";
import { Text, View, StyleSheet, Button, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, Camera } from "expo-camera";
import { useRouter } from "expo-router";
import { decodeVisitQrPayload } from "@/src/features/visits/qr";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { colors } from "@/src/theme/colors";

export default function SecurityScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    };

    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);

    try {
      const payload = decodeVisitQrPayload(data);

      if (payload && payload.visitId) {
        router.push(`/(security)/${payload.visitId}` as any);
      } else {
        throw new Error("Código QR no contiene un ID de visita válido.");
      }
    } catch (e: any) {
      Alert.alert("Error al escanear", e.message || "El formato del código QR es incorrecto.");
    }

    setTimeout(() => setScanned(false), 2000);
  };

  const headerStrip = (
    <View style={styles.headerStrip}>
      <ScreenHeader title="Escanear" showBack={false} />
    </View>
  );

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.outer} edges={["top", "left", "right", "bottom"]}>
        {headerStrip}
        <View style={styles.body}>
          <Text style={{ color: "#fff" }}>Solicitando permiso de cámara...</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.outer} edges={["top", "left", "right", "bottom"]}>
        {headerStrip}
        <View style={styles.body}>
          <Text style={styles.permissionText}>Sin acceso a la cámara</Text>
          <Text style={styles.permissionSubtitle}>Por favor, habilita el permiso en la configuración de tu dispositivo.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.outer} edges={["top", "left", "right", "bottom"]}>
      {headerStrip}
      <View style={styles.body}>
        <Text style={styles.subtitle}>Apunta la cámara al código de la visita</Text>
        <View style={styles.cameraContainer}>
          <CameraView
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        {scanned && <Button title={"Escanear de nuevo"} onPress={() => setScanned(false)} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#000" },
  headerStrip: { backgroundColor: colors.background, alignSelf: "stretch" },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  subtitle: { fontSize: 16, color: "gray", marginBottom: 20 },
  cameraContainer: {
    width: "80%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 20,
    marginBottom: 40,
  },
  permissionText: { fontSize: 18, color: "white", textAlign: "center" },
  permissionSubtitle: { fontSize: 14, color: "gray", textAlign: "center", marginTop: 10 },
});
