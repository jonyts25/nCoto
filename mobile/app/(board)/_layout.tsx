import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/src/features/auth/useAuth";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";

/**
 * La mesa directiva vive en (resident). Este grupo solo redirige; no usar <Redirect> en render
 * (evita bucles de actualización con el router).
 */
export default function BoardLayout() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      const k = "board:out";
      if (lastKeyRef.current === k) return;
      lastKeyRef.current = k;
      router.replace("/(auth)/login");
      return;
    }

    const k = `board:in:${session.user.id}`;
    if (lastKeyRef.current === k) return;
    lastKeyRef.current = k;
    router.replace("/(resident)");
  }, [isLoading, session, router]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#4f46e5" />
      <Text style={styles.hint}>Redirigiendo…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#f8fafc" },
  hint: { marginTop: 12, color: "#64748b", fontSize: 14 },
});
