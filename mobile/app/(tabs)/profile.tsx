import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { clearToken } from "@/src/features/auth/session";

export default function ProfileScreen() {
  async function onLogout() {
    await clearToken();
    router.replace("/(auth)/login");
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Perfil</Text>
      <Text>Datos del residente (placeholder)</Text>

      <Pressable
        onPress={onLogout}
        style={{
          backgroundColor: "black",
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
