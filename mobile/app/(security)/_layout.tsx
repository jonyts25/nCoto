import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, Text, StyleSheet, Pressable } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useEffect, useRef } from "react";

export default function SecurityLayout() {
  const router = useRouter();
  const { session, isLoading, userRole } = useAuth();
  const kickKeyRef = useRef<string | null>(null);
  const loginKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      const k = "sec:out";
      if (loginKeyRef.current === k) return;
      loginKeyRef.current = k;
      router.replace("/(auth)/login");
      return;
    }

    if (userRole == null) return;

    if (userRole !== "guard") {
      const k = `sec:kick:${session.user.id}`;
      if (kickKeyRef.current === k) return;
      kickKeyRef.current = k;
      router.replace("/");
    }
  }, [isLoading, session, session?.user?.id, userRole, router]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF3B30" />
        <Text style={styles.hint}>Preparando módulo de seguridad…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF3B30" />
        <Text style={styles.hint}>Redirigiendo…</Text>
      </View>
    );
  }

  if (userRole !== "guard") {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedTitle}>Sin permiso de seguridad</Text>
        <Text style={styles.blockedBody}>
          Esta área es solo para cuentas con rol de guardia. Redirigiendo al inicio…
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#FF3B30" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Escanear",
          tabBarIcon: ({ color }) => <Ionicons name="scan" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: "Bitácora",
          tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#f8f9fa" },
  hint: { marginTop: 12, color: "#666", fontSize: 14 },
  blocked: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f8f9fa" },
  blockedTitle: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#1a1a1a", textAlign: "center" },
  blockedBody: { fontSize: 16, color: "#444", lineHeight: 22, marginBottom: 24, textAlign: "center" },
  button: { backgroundColor: "#FF3B30", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
