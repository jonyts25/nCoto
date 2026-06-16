import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/features/auth/useAuth";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SuperCotoSelector } from "@/src/features/profiles/SuperCotoSelector";
import { supabase } from "@/src/lib/supabase";
import {
  fetchPropertiesForCoto,
  setPropertyDelinquentByHouse,
  type AdminPropertyRow,
} from "@/src/features/admin/propertiesRepo";
import { colors } from "@/src/theme/colors";
import { formatHouseLabel } from "@/src/features/properties/formatHouseLabel";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { userRole, isLoading: authLoading } = useAuth();
  const { effectiveCotoId, scopeVersion } = useCotoScope();
  const [properties, setProperties] = useState<AdminPropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const kickRef = useRef<string | null>(null);

  const canView = userRole === "admin" || userRole === "coto_admin";

  const legend = useMemo(
    () => (
      <Text style={styles.legend}>
        Verde = al corriente. Rojo = moroso. Los cambios aplican políticas de visitas y caseta.
      </Text>
    ),
    [],
  );

  const load = useCallback(async () => {
    if (!effectiveCotoId || !canView) {
      setProperties([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setProperties(await fetchPropertiesForCoto(effectiveCotoId));
    } finally {
      setLoading(false);
    }
  }, [effectiveCotoId, canView, scopeVersion]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!effectiveCotoId || !canView) return;

    const channel = supabase
      .channel(`admin-properties:${effectiveCotoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter: `coto_id=eq.${effectiveCotoId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveCotoId, canView, load]);

  useEffect(() => {
    if (authLoading) return;
    if (canView) return;
    const key = `admin-kick:${userRole ?? "null"}`;
    if (kickRef.current === key) return;
    kickRef.current = key;
    router.replace("/");
  }, [authLoading, canView, userRole, router]);

  const onToggleDelinquent = async (row: AdminPropertyRow, next: boolean) => {
    if (!effectiveCotoId) return;
    setToggling((s) => new Set(s).add(row.id));
    const res = await setPropertyDelinquentByHouse(effectiveCotoId, row.house_number, next);
    setToggling((s) => {
      const n = new Set(s);
      n.delete(row.id);
      return n;
    });
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    setProperties((prev) =>
      prev.map((p) =>
        p.house_number.trim().toLowerCase() === row.house_number.trim().toLowerCase()
          ? { ...p, is_delinquent: next }
          : p,
      ),
    );
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.kickWrap}>
          <ActivityIndicator size="large" color={colors.success} />
          <Text style={styles.kickText}>Volviendo al inicio…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Casas y morosidad" />
      <SuperCotoSelector />
      {loading && properties.length === 0 ? (
        <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {legend}
          {properties.length === 0 ? (
            <Text style={styles.empty}>No hay propiedades registradas en este coto.</Text>
          ) : (
            properties.map((p) => {
              const ok = !p.is_delinquent;
              const busy = toggling.has(p.id);
              return (
                <View
                  key={p.id}
                  style={[
                    styles.card,
                    { borderColor: ok ? "#81C784" : colors.danger, backgroundColor: ok ? "#E8F5E9" : "#FFEBEE" },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.house}>{formatHouseLabel(p.house_number)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: ok ? colors.success : colors.danger }]}>
                      <Text style={styles.badgeText}>{ok ? "OK" : "MORA"}</Text>
                    </View>
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Marcar en mora</Text>
                    <Switch
                      value={p.is_delinquent}
                      onValueChange={(v) => void onToggleDelinquent(p, v)}
                      disabled={busy}
                      trackColor={{ false: "#ccc", true: "#FFCDD2" }}
                      thumbColor={p.is_delinquent ? colors.danger : "#f4f4f4"}
                    />
                  </View>
                  {busy ? <Text style={styles.saving}>Guardando…</Text> : null}
                </View>
              );
            })
          )}
          <Pressable
            style={styles.linkPayments}
            onPress={() => router.push("/(admin)/pending_payments" as any)}
          >
            <Text style={styles.linkPaymentsText}>Validar comprobantes de pago →</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, paddingBottom: 40 },
  legend: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  empty: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginTop: 24 },
  card: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  house: { fontSize: 18, fontWeight: "800", color: colors.text },
  label: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  saving: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  linkPayments: { marginTop: 20, padding: 12 },
  linkPaymentsText: { color: colors.primary, fontWeight: "600", textAlign: "center" },
  kickWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  kickText: { marginTop: 12, fontSize: 15, color: colors.textMuted },
});
