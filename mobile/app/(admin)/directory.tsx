import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/features/auth/useAuth";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SuperCotoSelector } from "@/src/features/profiles/SuperCotoSelector";
import { Button } from "@/src/components/Button";
import { colors } from "@/src/theme/colors";
import { formatHouseLabel } from "@/src/features/properties/formatHouseLabel";
import {
  approveResident,
  fetchDirectoryProfiles,
  listActiveResidents,
  listPendingResidents,
  occupancyLabel,
  rejectResident,
  type DirectoryProfileRow,
} from "@/src/features/admin/directoryRepo";

type TabKey = "pending" | "active";

export default function DirectoryScreen() {
  const router = useRouter();
  const { userRole, isLoading: authLoading } = useAuth();
  const { effectiveCotoId, scopeVersion } = useCotoScope();
  const kickRef = useRef<string | null>(null);

  const [tab, setTab] = useState<TabKey>("pending");
  const [rows, setRows] = useState<DirectoryProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canView = userRole === "admin" || userRole === "coto_admin";

  const load = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await fetchDirectoryProfiles());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar el directorio.";
      setLoadError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, scopeVersion]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (authLoading) return;
    if (canView) return;
    const key = `dir-kick:${userRole ?? "null"}`;
    if (kickRef.current === key) return;
    kickRef.current = key;
    router.replace("/");
  }, [authLoading, canView, userRole, router]);

  const pending = useMemo(() => listPendingResidents(rows), [rows]);
  const active = useMemo(() => listActiveResidents(rows), [rows]);
  const listData = tab === "pending" ? pending : active;

  const onApprove = (row: DirectoryProfileRow) => {
    if (!effectiveCotoId) {
      Alert.alert("Coto no seleccionado", "Elige el fraccionamiento activo.");
      return;
    }
    Alert.alert(
      "Aprobar vecino",
      `¿Confirmar acceso de ${row.display_name?.trim() || "este usuario"} a ${formatHouseLabel(row.house_number ?? "")}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Aprobar",
          onPress: () => {
            void (async () => {
              setBusyId(row.id);
              const res = await approveResident(row.id, effectiveCotoId);
              setBusyId(null);
              if (res.error) {
                Alert.alert("No se pudo aprobar", res.error);
                return;
              }
              await load();
            })();
          },
        },
      ],
    );
  };

  const onReject = (row: DirectoryProfileRow) => {
    Alert.alert(
      "Rechazar solicitud",
      `¿Rechazar la solicitud de ${row.display_name?.trim() || "este usuario"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Rechazar",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusyId(row.id);
              const res = await rejectResident(row.id);
              setBusyId(null);
              if (res.error) {
                Alert.alert("No se pudo rechazar", res.error);
                return;
              }
              await load();
            })();
          },
        },
      ],
    );
  };

  const renderPending = ({ item }: { item: DirectoryProfileRow }) => {
    const busy = busyId === item.id;
    const name = item.full_name?.trim() || item.display_name?.trim() || "Sin nombre";
    const email = item.email?.trim() || "Correo no disponible";
    const phone = item.phone?.trim();
    const houseRaw = item.claimed_house_number ?? item.house_number;
    const house = houseRaw ? formatHouseLabel(houseRaw) : "Casa: —";

    return (
      <View style={styles.pendingCard}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={styles.cardMeta}>{email}</Text>
        {phone ? <Text style={styles.cardMeta}>{phone}</Text> : null}
        <Text style={styles.cardMeta}>{house}</Text>
        <Text style={styles.cardKind}>{occupancyLabel(item.occupancy_kind)}</Text>
        <View style={styles.actionRow}>
          <View style={{ flex: 1 }}>
            <Button
              title="Aprobar"
              variant="primary"
              loading={busy}
              disabled={busy}
              onPress={() => onApprove(item)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Rechazar"
              variant="danger"
              disabled={busy}
              onPress={() => onReject(item)}
            />
          </View>
        </View>
      </View>
    );
  };

  const renderActive = ({ item }: { item: DirectoryProfileRow }) => {
    const name = item.full_name?.trim() || item.display_name?.trim() || "Sin nombre";
    const house = formatHouseLabel(
      item.property_house_number ?? item.house_number ?? "",
    );

    return (
      <View style={styles.activeCard}>
        <View style={styles.activeRow}>
          <Text style={styles.activeHouse}>{house}</Text>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>{occupancyLabel(item.occupancy_kind)}</Text>
          </View>
        </View>
        <Text style={styles.activeName}>{name}</Text>
        {item.email ? <Text style={styles.cardMeta}>{item.email}</Text> : null}
      </View>
    );
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.kickWrap}>
          <ActivityIndicator size="large" color={colors.success} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Residentes" />
      <SuperCotoSelector />

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === "pending" && styles.tabActive]}
          onPress={() => setTab("pending")}
        >
          <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>
            Pendientes{pending.length > 0 ? ` (${pending.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "active" && styles.tabActive]}
          onPress={() => setTab("active")}
        >
          <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>
            Activos{active.length > 0 ? ` (${active.length})` : ""}
          </Text>
        </Pressable>
      </View>

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          style={styles.list}
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "pending"
                ? "No hay solicitudes pendientes de aprobación."
                : "No hay residentes activos vinculados a una propiedad."}
            </Text>
          }
          renderItem={tab === "pending" ? renderPending : renderActive}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: "#fff" },
  list: { flex: 1 },
  listPad: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  empty: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginTop: 24 },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FFEBEE",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { fontSize: 13, color: colors.danger, lineHeight: 18 },
  retryText: { marginTop: 8, fontSize: 14, fontWeight: "700", color: colors.primary },
  pendingCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  cardName: { fontSize: 17, fontWeight: "800", color: colors.text },
  cardMeta: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  cardKind: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  activeCard: {
    backgroundColor: "#E8F5E9",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#81C784",
    padding: 14,
    marginBottom: 12,
  },
  activeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeHouse: { fontSize: 17, fontWeight: "800", color: colors.text, flex: 1 },
  activeBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  activeName: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 6 },
  kickWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
});
