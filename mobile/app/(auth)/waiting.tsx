import { useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme/colors";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/features/auth/useAuth";
import { supabase } from "@/src/lib/supabase";
import { residentIsAwaitingApproval } from "@/src/features/auth/onboardingRepo";

export default function WaitingRoomScreen() {
  const router = useRouter();
  const { profile, refetchProfile, isLoading } = useAuth();

  const checkApproval = useCallback(async () => {
    await refetchProfile();
  }, [refetchProfile]);

  useFocusEffect(
    useCallback(() => {
      void checkApproval();
    }, [checkApproval]),
  );

  useFocusEffect(
    useCallback(() => {
      if (isLoading || !profile) return;
      if (profile.approval_status === "approved" || profile.property_id) {
        router.replace("/");
      } else if (!residentIsAwaitingApproval(profile)) {
        router.replace("/(auth)/onboarding");
      }
    }, [isLoading, profile, router]),
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="hourglass-outline" size={56} color={colors.primary} />
        </View>
        <Text style={styles.title}>Sala de espera</Text>
        <Text style={styles.message}>
          Tu solicitud está siendo revisada por el administrador del coto.
        </Text>
        <Text style={styles.hint}>
          Te avisaremos cuando tu acceso esté activo. Puedes cerrar la app y volver más tarde.
        </Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ marginTop: 28, width: "100%" }}>
            <Button title="Actualizar estado" variant="outline" onPress={() => void checkApproval()} />
            <View style={{ height: 12 }} />
            <Button title="Cerrar sesión" variant="secondary" onPress={() => void signOut()} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: 12 },
  message: {
    fontSize: 17,
    color: colors.text,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "600",
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 12,
  },
});
