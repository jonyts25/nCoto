import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getToken } from "@/src/features/auth/session";

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      router.replace(token ? "/(tabs)" : "/(auth)/login");
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return null;
}
