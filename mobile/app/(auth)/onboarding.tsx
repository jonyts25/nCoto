import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "@/src/theme/colors";
import { Button } from "@/src/components/Button";
import { submitAccessRequest } from "@/src/features/auth/onboardingRepo";
import type { OccupancyKind } from "@/src/features/admin/directoryRepo";
import { useAuth } from "@/src/features/auth/useAuth";

export default function OnboardingScreen() {
  const router = useRouter();
  const { refetchProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [occupancy, setOccupancy] = useState<OccupancyKind>("owner");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    const res = await submitAccessRequest({
      fullName,
      phone,
      claimedHouseNumber: houseNumber,
      occupancyKind: occupancy,
    });
    setSubmitting(false);

    if (res.error) {
      Alert.alert("No se pudo enviar", res.error);
      return;
    }

    await refetchProfile();
    router.replace("/(auth)/waiting");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Completa tu perfil</Text>
          <Text style={styles.subtitle}>
            Cuéntanos quién eres y a qué casa perteneces. El administrador revisará tu solicitud.
          </Text>

          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ej. María López"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Teléfono (WhatsApp)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10 dígitos"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Número de casa</Text>
          <TextInput
            style={styles.input}
            value={houseNumber}
            onChangeText={setHouseNumber}
            placeholder="Ej. 102"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Tipo de ocupación</Text>
          <View style={styles.occRow}>
            <Pressable
              style={[styles.occChip, occupancy === "owner" && styles.occChipActive]}
              onPress={() => setOccupancy("owner")}
            >
              <Text style={[styles.occText, occupancy === "owner" && styles.occTextActive]}>
                Soy Dueño
              </Text>
            </Pressable>
            <Pressable
              style={[styles.occChip, occupancy === "tenant" && styles.occChipActive]}
              onPress={() => setOccupancy("tenant")}
            >
              <Text style={[styles.occText, occupancy === "tenant" && styles.occTextActive]}>
                Soy Inquilino
              </Text>
            </Pressable>
          </View>

          <Button
            title="Solicitar acceso"
            loading={submitting}
            disabled={submitting}
            onPress={() => void onSubmit()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  occRow: { flexDirection: "row", gap: 10, marginBottom: 24, marginTop: 4 },
  occChip: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  occChipActive: { borderColor: colors.primary, backgroundColor: "#E3F2FD" },
  occText: { fontSize: 14, fontWeight: "600", color: colors.text },
  occTextActive: { color: colors.primary, fontWeight: "800" },
});
