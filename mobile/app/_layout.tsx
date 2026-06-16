import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CotoScopeProvider } from "@/src/context/CotoScopeContext";
import { PushTokenRegistrar } from "@/src/components/PushTokenRegistrar";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CotoScopeProvider>
        <PushTokenRegistrar />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(security)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(resident)" />
          <Stack.Screen name="(board)" />
        </Stack>
      </CotoScopeProvider>
    </SafeAreaProvider>
  );
}
