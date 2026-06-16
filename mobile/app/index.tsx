import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/src/features/auth/useAuth";
import {
  residentIsAwaitingApproval,
  residentNeedsOnboarding,
} from "@/src/features/auth/onboardingRepo";
import { View, ActivityIndicator, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import type { UserAppRole } from "@/src/features/visits/types";

function homePathForRole(role: UserAppRole | null): "/(admin)" | "/(security)" | "/(resident)" {
  if (role === "admin" || role === "coto_admin") return "/(admin)";
  if (role === "guard") return "/(security)";
  return "/(resident)";
}

export default function Index() {
  const router = useRouter();
  const { session, isLoading, userRole, profile, authIssue } = useAuth();
  const lastNavKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      const key = "auth:logout";
      if (lastNavKeyRef.current === key) return;
      lastNavKeyRef.current = key;
      router.replace("/(auth)/login");
      return;
    }

    if (authIssue === "missing_email" || authIssue === "missing_profile") {
      lastNavKeyRef.current = `issue:${authIssue}`;
      return;
    }

    const role = userRole ?? "resident";

    if (profile && role === "resident") {
      if (residentNeedsOnboarding(profile)) {
        const key = `onboarding:${session.user.id}`;
        if (lastNavKeyRef.current !== key) {
          lastNavKeyRef.current = key;
          router.replace("/(auth)/onboarding");
        }
        return;
      }
      if (residentIsAwaitingApproval(profile)) {
        const key = `waiting:${session.user.id}`;
        if (lastNavKeyRef.current !== key) {
          lastNavKeyRef.current = key;
          router.replace("/(auth)/waiting");
        }
        return;
      }
    }

    const dest = homePathForRole(userRole);
    const key = `home:${session.user.id}:${role}:${dest}`;
    if (lastNavKeyRef.current === key) return;
    lastNavKeyRef.current = key;
    router.replace(dest);
  }, [isLoading, session, session?.user?.id, userRole, profile, authIssue, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeFill} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Cargando sesión…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeFill} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Redirigiendo al inicio de sesión…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (authIssue === "missing_email") {
    return (
      <SafeAreaView style={styles.safeFill} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>Cuenta incompleta</Text>
          <Text style={styles.blockedBody}>
            Tu sesión no incluye un correo verificado. Cierra sesión y vuelve a entrar, o contacta al administrador.
          </Text>
          <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.buttonText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (authIssue === "missing_profile") {
    return (
      <SafeAreaView style={styles.safeFill} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>Perfil no encontrado</Text>
          <Text style={styles.blockedBody}>
            No hay fila en «profiles» para tu usuario. Aplica las migraciones de Supabase o contacta al administrador.
          </Text>
          <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.buttonText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeFill} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Abriendo la app…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeFill: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  hint: { marginTop: 12, color: "#666", fontSize: 14 },
  blocked: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  blockedTitle: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#1a1a1a" },
  blockedBody: { fontSize: 16, color: "#444", lineHeight: 22, marginBottom: 24 },
  button: { backgroundColor: "#2E7D32", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
