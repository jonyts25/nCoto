import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { setToken } from "@/src/features/auth/session";

export default function LoginScreen() {
  const [email, setEmail] = useState("");

  async function onLogin() {
    if (!email.trim()) {
      Alert.alert("Falta algo", "Escribe tu email (por ahora es fake).");
      return;
    }
    await setToken("demo-token");
    router.replace("/(tabs)");
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>NCoto</Text>
      <Text>Inicia sesión</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="correo@ejemplo.com"
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />

      <Pressable
        onPress={onLogin}
        style={{
          backgroundColor: "black",
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Entrar</Text>
      </Pressable>
    </View>
  );
}
