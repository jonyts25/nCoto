import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8F9FA" } }}>
      <Stack.Screen name="login" options={{ title: "Iniciar sesión" }} />
      <Stack.Screen name="register" options={{ title: "Registro" }} />
      <Stack.Screen name="onboarding" options={{ title: "Completar perfil" }} />
      <Stack.Screen name="waiting" options={{ title: "Sala de espera" }} />
    </Stack>
  );
}
