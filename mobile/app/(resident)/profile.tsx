import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@/src/features/auth/useAuth";
import { supabase } from "@/src/lib/supabase";
import { fetchCurrentUserProperty, type PropertyRow } from "@/src/features/properties/repo";
import { Button } from "@/src/components/Button";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { colors } from "@/src/theme/colors";
import { formatHouseLabel } from "@/src/features/properties/formatHouseLabel";

export default function ResidentProfile() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProperty(await fetchCurrentUserProperty());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayName = profile?.display_name?.trim() || "Sin nombre en perfil";
  const houseLine = property
    ? formatHouseLabel(property.house_number ?? "")
    : "Sin propiedad vinculada (revisa property_id en el perfil)";

  const labelFromProperty =
    property?.display_label != null ? String(property.display_label).trim() : "";
  const secondaryLine = labelFromProperty || session?.user?.email || "";

  const maintenanceOk = property ? !property.is_delinquent : true;

  const signOut = () => {
    Alert.alert("Cerrar sesión", "¿Salir de la aplicación?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await supabase.auth.signOut();
            router.replace("/(auth)/login" as any);
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader title="Mi casa" showSignOut={false} />
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.address}>{houseLine}</Text>
              {secondaryLine.trim() !== "" ? <Text style={styles.email}>{secondaryLine}</Text> : null}
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Estatus de cuenta</Text>
              <Text style={[styles.status, { color: maintenanceOk ? colors.success : colors.danger }]}>
                {maintenanceOk ? "Al corriente" : "Adeudo / restricción"}
              </Text>
            </View>

            <Pressable
              style={styles.linkCard}
              onPress={() => router.push("/(resident)/payments" as any)}
              accessibilityRole="button"
              accessibilityLabel="Ir a comprobantes de pago"
            >
              <Text style={styles.linkTitle}>Comprobantes de pago</Text>
              <Text style={styles.linkSub}>Sube transferencias o recibos para revisión</Text>
            </Pressable>

            <Button title="Cerrar sesión" variant="danger" onPress={signOut} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  header: { alignItems: "center", marginBottom: 24 },
  name: { fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center" },
  address: { fontSize: 17, color: colors.textMuted, marginTop: 8, textAlign: "center" },
  email: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  linkCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  linkTitle: { fontSize: 17, fontWeight: "800", color: colors.primary },
  linkSub: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  infoCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { fontSize: 14, color: colors.textMuted, marginBottom: 8, fontWeight: "600" },
  status: { fontSize: 18, fontWeight: "800" },
});
