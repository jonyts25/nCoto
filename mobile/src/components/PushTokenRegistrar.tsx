import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useRegisterExpoPushToken } from "@/src/features/push/useRegisterExpoPushToken";

/** Registra Expo Push en `profiles` cuando hay sesión (sin duplicar useAuth). */
export function PushTokenRegistrar() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useRegisterExpoPushToken(userId);
  return null;
}
