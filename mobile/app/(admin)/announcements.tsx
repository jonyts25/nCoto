import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/features/auth/useAuth";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SuperCotoSelector } from "@/src/features/profiles/SuperCotoSelector";
import { Button } from "@/src/components/Button";
import { colors } from "@/src/theme/colors";
import {
  fetchAlertsForCoto,
  insertCotoAlert,
  priorityFromRow,
  type AlertPriority,
  type CotoAlertRow,
} from "@/src/features/admin/announcementsRepo";

const PRIORITIES: { key: AlertPriority; label: string; hint: string }[] = [
  { key: "urgent", label: "Urgente", hint: "Push a todo el coto" },
  { key: "maintenance", label: "Mantenimiento", hint: "Aviso operativo" },
  { key: "general", label: "General", hint: "Residentes" },
];

type PriorityStyle = { border: string; bg: string; badge: string; label: string };

function priorityStyles(p: AlertPriority): PriorityStyle {
  switch (p) {
    case "urgent":
      return {
        border: colors.danger,
        bg: "#FFEBEE",
        badge: colors.danger,
        label: "URGENTE",
      };
    case "maintenance":
      return {
        border: "#F9A825",
        bg: "#FFF8E1",
        badge: "#F9A825",
        label: "MANTENIMIENTO",
      };
    default:
      return {
        border: colors.primary,
        bg: "#E3F2FD",
        badge: colors.primary,
        label: "GENERAL",
      };
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminAlertsScreen() {
  const router = useRouter();
  const { session, userRole, isLoading: authLoading } = useAuth();
  const { effectiveCotoId, scopeVersion } = useCotoScope();
  const kickRef = useRef<string | null>(null);

  const [alerts, setAlerts] = useState<CotoAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<AlertPriority>("urgent");
  const [submitting, setSubmitting] = useState(false);

  const canView = userRole === "admin" || userRole === "coto_admin";
  /** RLS `announcements_insert_publishers`: admin, coto_admin, guard, board_member. */
  const canPublish =
    userRole === "admin" ||
    userRole === "coto_admin" ||
    userRole === "guard" ||
    userRole === "board_member";

  const load = useCallback(async () => {
    if (!effectiveCotoId || !canView) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAlerts(await fetchAlertsForCoto(effectiveCotoId));
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
    if (authLoading) return;
    if (canView) return;
    const key = `alerts-kick:${userRole ?? "null"}`;
    if (kickRef.current === key) return;
    kickRef.current = key;
    router.replace("/");
  }, [authLoading, canView, userRole, router]);

  const onSubmit = useCallback(async () => {
    if (!canPublish) {
      Alert.alert(
        "Sin permiso para emitir",
        "Tu rol no puede publicar alertas en este coto. Contacta al administrador.",
      );
      return;
    }
    if (!effectiveCotoId || !session?.user?.id) {
      Alert.alert("Coto no seleccionado", "Elige el fraccionamiento activo antes de emitir una alerta.");
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      Alert.alert("Campos incompletos", "Indica título y mensaje de la alerta.");
      return;
    }

    const confirmPush =
      priority === "urgent"
        ? "Se enviará una notificación push a todos los usuarios del coto con token registrado."
        : priority === "maintenance"
          ? "Se notificará a todo el coto (push) con prioridad de mantenimiento."
          : "Se notificará a los residentes del coto (push).";

    Alert.alert("Emitir alerta", `${confirmPush}\n\n¿Continuar?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Emitir",
        style: priority === "urgent" ? "destructive" : "default",
        onPress: () => {
          void (async () => {
            setSubmitting(true);
            const res = await insertCotoAlert({
              cotoId: effectiveCotoId,
              title: trimmedTitle,
              body: trimmedBody,
              priority,
              createdBy: session.user.id,
            });
            setSubmitting(false);
            if (res.error) {
              Alert.alert("No se pudo emitir", res.error);
              return;
            }
            setTitle("");
            setBody("");
            setPriority("urgent");
            if (res.data) {
              setAlerts((prev) => [res.data!, ...prev]);
            } else {
              void load();
            }
            Alert.alert(
              "Alerta emitida",
              "La alerta quedó registrada. Si push está configurado en Supabase, los dispositivos recibirán la notificación en segundos.",
            );
          })();
        },
      },
    ]);
  }, [body, canPublish, effectiveCotoId, priority, session?.user?.id, title]);

  const listHeader = useMemo(
    () => (
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>Nueva alerta</Text>
        <Text style={styles.formHint}>
          Al guardar se inserta en la base de datos y el trigger dispara push automático.
        </Text>


        <Text style={styles.label}>Prioridad</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => {
            const active = priority === p.key;
            const ps = priorityStyles(p.key);
            return (
              <Pressable
                key={p.key}
                onPress={() => setPriority(p.key)}
                style={[
                  styles.priorityChip,
                  {
                    borderColor: ps.border,
                    backgroundColor: active ? ps.bg : colors.surface,
                  },
                  active && styles.priorityChipActive,
                ]}
              >
                <Text style={[styles.priorityChipLabel, active && { color: ps.border, fontWeight: "800" }]}>
                  {p.label}
                </Text>
                <Text style={styles.priorityChipHint}>{p.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ej. Corte de agua programado"
          placeholderTextColor={colors.textMuted}
          editable={canPublish && !submitting}
        />

        <Text style={styles.label}>Mensaje</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={body}
          onChangeText={setBody}
          placeholder="Detalle breve para residentes y caseta…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          editable={canPublish && !submitting}
        />

        <Button
          title={submitting ? "Emitiendo…" : "Emitir alerta"}
          variant={priority === "urgent" ? "danger" : "primary"}
          loading={submitting}
          disabled={!canPublish || submitting || !effectiveCotoId}
          onPress={() => void onSubmit()}
        />

        <Text style={styles.historyTitle}>Alertas vigentes</Text>
        <Text style={styles.historyHint}>
          Listado según políticas del coto activo ({effectiveCotoId ? "conectado" : "sin coto"}).
        </Text>
      </View>
    ),
    [body, canPublish, effectiveCotoId, onSubmit, priority, submitting, title],
  );

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
      <ScreenHeader title="Alertas del Coto" />
      <SuperCotoSelector />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {loading && alerts.length === 0 ? (
          <ActivityIndicator size="large" color={colors.success} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={alerts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listPad}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <Text style={styles.empty}>Aún no hay alertas vigentes en este coto.</Text>
            }
            renderItem={({ item }) => {
              const p = priorityFromRow(item);
              const ps = priorityStyles(p);
              return (
                <View style={[styles.alertCard, { borderColor: ps.border, backgroundColor: ps.bg }]}>
                  <View style={styles.alertCardTop}>
                    <View style={[styles.alertBadge, { backgroundColor: ps.badge }]}>
                      <Text style={styles.alertBadgeText}>{ps.label}</Text>
                    </View>
                    <Text style={styles.alertTime}>{formatWhen(item.created_at)}</Text>
                  </View>
                  <Text style={styles.alertTitle}>{item.title}</Text>
                  <Text style={styles.alertBody}>{item.body}</Text>
                  {item.pinned ? (
                    <Text style={styles.alertMeta}>Fijada · audiencia: {item.audience}</Text>
                  ) : (
                    <Text style={styles.alertMeta}>Audiencia: {item.audience}</Text>
                  )}
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listPad: { paddingHorizontal: 16, paddingBottom: 32 },
  formBlock: { paddingTop: 8, paddingBottom: 12 },
  formTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  formHint: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  warnBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  warnText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 6, marginTop: 8 },
  priorityRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  priorityChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 10,
    minHeight: 64,
  },
  priorityChipActive: { borderWidth: 3 },
  priorityChipLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  priorityChipHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  inputMultiline: { minHeight: 96, paddingTop: 12 },
  historyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginTop: 20 },
  historyHint: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  empty: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginTop: 16 },
  alertCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    marginBottom: 12,
  },
  alertCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  alertBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  alertBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  alertTime: { fontSize: 11, color: colors.textMuted },
  alertTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 6 },
  alertBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  alertMeta: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  kickWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  kickText: { marginTop: 12, fontSize: 15, color: colors.textMuted },
});
