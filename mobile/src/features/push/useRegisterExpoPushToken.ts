import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "@/src/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registra el token de Expo Push en `profiles.expo_push_token` para el usuario autenticado.
 * Requiere permisos de notificación (iOS) y, en builds de producción, `extra.eas.projectId` en app config.
 */
export function useRegisterExpoPushToken(userId: string | null | undefined) {
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void (async () => {
      if (!Device.isDevice) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted" || cancelled) return;

      const projectId = resolveExpoProjectId();
      let tokenData: Notifications.ExpoPushToken;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
      } catch (e) {
        console.warn("[push] getExpoPushTokenAsync:", e);
        return;
      }

      const token = tokenData.data?.trim();
      if (!token || cancelled) return;
      if (lastWritten.current === token) return;

      const { error } = await supabase
        .from("profiles")
        .update({ expo_push_token: token, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) {
        console.warn("[push] profiles update expo_push_token:", error.message);
        return;
      }
      lastWritten.current = token;
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
