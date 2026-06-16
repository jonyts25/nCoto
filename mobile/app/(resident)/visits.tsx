import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  Modal,
  FlatList,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createVisit, getVisitById, listVisits, updateVisit } from "@/src/features/visits/repo";
import { Button } from "@/src/components/Button";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import type { Visit, VisitKind } from "@/src/features/visits/types";
import {
  formatLocalDateISO,
  formatVisitTimeRange,
  isValidHm,
  isVisitNotExpired,
  parseWeeklySchedule,
} from "@/src/features/visits/validation";
import { fetchCurrentUserPropertyIsDelinquent } from "@/src/features/delinquency/repo";
import { colors } from "@/src/theme/colors";
import { Ionicons } from "@expo/vector-icons";

const SERVICIO_OPTIONS = ["Telmex", "Total Play", "Megacable", "CFE", "Agua", "Otro"] as const;
const PAQUET_OPTIONS = ["Amazon", "Mercado Libre", "FedEx", "Estafeta", "DHL", "Otro"] as const;

const KINDS: { key: VisitKind; label: string }[] = [
  { key: "eventual", label: "Eventual" },
  { key: "servicio", label: "Servicio" },
  { key: "paqueteria", label: "Paquetería" },
  { key: "frecuente", label: "Frecuente" },
];

type HistoryTab = "eventual" | "frecuente";

function historyBadgeLabel(v: Visit): { text: string; tone: "ok" | "warn" | "muted" } {
  if (v.status === "used") return { text: "Usado", tone: "muted" };
  if (v.status === "expired") return { text: "Vencido", tone: "warn" };
  return { text: "Pendiente", tone: "ok" };
}

function parseBrandFromGuestName(
  kind: VisitKind,
  guestName: string
): { preset: string | null; custom: string } {
  const g = guestName.trim();
  const servList = SERVICIO_OPTIONS as readonly string[];
  const paqList = PAQUET_OPTIONS as readonly string[];
  if (kind === "servicio") {
    if (servList.includes(g)) {
      return g === "Otro" ? { preset: "Otro", custom: "" } : { preset: g, custom: "" };
    }
    return { preset: "Otro", custom: g };
  }
  if (kind === "paqueteria") {
    if (paqList.includes(g)) {
      return g === "Otro" ? { preset: "Otro", custom: "" } : { preset: g, custom: "" };
    }
    return { preset: "Otro", custom: g };
  }
  return { preset: null, custom: "" };
}

export default function CreateVisitScreen() {
  const [name, setName] = useState("");
  const [plates, setPlates] = useState("");
  const [kind, setKind] = useState<VisitKind>("eventual");
  const [servicioPick, setServicioPick] = useState<string>(SERVICIO_OPTIONS[0]);
  const [paquetPick, setPaquetPick] = useState<string>(PAQUET_OPTIONS[0]);
  const [customServicio, setCustomServicio] = useState("");
  const [customPaquet, setCustomPaquet] = useState("");
  const [validDay, setValidDay] = useState(formatLocalDateISO(new Date()));
  const [weekday, setWeekday] = useState("4");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("22:00");
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("eventual");
  const [history, setHistory] = useState<Visit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isDelinquent, setIsDelinquent] = useState(false);
  const router = useRouter();
  const { editId: editIdParam } = useLocalSearchParams<{ editId?: string }>();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const d = await fetchCurrentUserPropertyIsDelinquent();
        if (cancelled) return;
        setIsDelinquent(d);
        if (d) {
          router.replace("/(resident)" as any);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router])
  );

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setHistory(await listVisits());
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const filteredHistory = useMemo(() => {
    if (historyTab === "frecuente") return history.filter((v) => v.visitType === "frecuente");
    return history.filter((v) => v.visitType !== "frecuente");
  }, [history, historyTab]);

  const applyVisitToForm = useCallback((v: Visit, opts?: { keepOpen?: boolean }) => {
    const vt = v.visitType ?? "eventual";
    setPlates(v.plates?.trim() ?? "");
    setKind(vt);
    if (v.validDay) setValidDay(v.validDay);
    if (vt === "frecuente" && v.schedule?.length) {
      setWeekday(String(v.schedule[0].weekday));
      setStart(v.schedule[0].start);
      setEnd(v.schedule[0].end);
    } else if (v.startTime && v.endTime) {
      setStart(v.startTime);
      setEnd(v.endTime);
    }
    if (vt === "servicio") {
      const { preset, custom } = parseBrandFromGuestName("servicio", v.guestName);
      if (preset && preset !== "Otro") {
        setServicioPick(preset);
        setCustomServicio("");
        setName(preset);
      } else {
        setServicioPick("Otro");
        setCustomServicio(custom || v.guestName);
        setName(custom || v.guestName);
      }
    } else if (vt === "paqueteria") {
      const { preset, custom } = parseBrandFromGuestName("paqueteria", v.guestName);
      if (preset && preset !== "Otro") {
        setPaquetPick(preset);
        setCustomPaquet("");
        setName(preset);
      } else {
        setPaquetPick("Otro");
        setCustomPaquet(custom || v.guestName);
        setName(custom || v.guestName);
      }
    } else {
      setName(v.guestName);
      setServicioPick(SERVICIO_OPTIONS[0]);
      setPaquetPick(PAQUET_OPTIONS[0]);
      setCustomServicio("");
      setCustomPaquet("");
    }
    if (!opts?.keepOpen) setHistoryOpen(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const id = typeof editIdParam === "string" ? editIdParam : null;
      if (!id) {
        setEditId(null);
        return;
      }
      let cancelled = false;
      setLoading(true);
      void getVisitById(id).then((v) => {
        if (cancelled) return;
        if (v && v.status === "active") {
          setEditId(v.id);
          applyVisitToForm(v, { keepOpen: true });
        } else {
          setEditId(null);
          Alert.alert("No editable", "Este pase ya no se puede editar.");
        }
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [editIdParam, applyVisitToForm])
  );

  const resolvedGuestName = (): string => {
    if (kind === "eventual" || kind === "frecuente") return name.trim();
    if (kind === "servicio") {
      if (servicioPick === "Otro") return customServicio.trim();
      return servicioPick;
    }
    if (kind === "paqueteria") {
      if (paquetPick === "Otro") return customPaquet.trim();
      return paquetPick;
    }
    return name.trim();
  };

  const handleSave = async () => {
    if (isDelinquent) {
      Alert.alert("No disponible", "Tu unidad tiene adeudo. No se pueden generar nuevos pases.");
      return;
    }
    const guest = resolvedGuestName();
    if (!guest) {
      Alert.alert("Falta el nombre", "Completa el visitante, proveedor o paquetería.");
      return;
    }
    if (kind !== "frecuente") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validDay.trim())) {
        Alert.alert("Fecha", "Usa la fecha como AAAA-MM-DD.");
        return;
      }
      const startHm = start.trim();
      const endHm = end.trim();
      if (!isValidHm(startHm) || !isValidHm(endHm)) {
        Alert.alert("Horario", "Indica hora de inicio y fin en formato HH:MM (24 h).");
        return;
      }
      const [sh, sm] = startHm.split(":").map(Number);
      const [eh, em] = endHm.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        Alert.alert("Horario", "La hora de inicio debe ser anterior a la hora de fin.");
        return;
      }
    }
    if (kind === "frecuente") {
      const wd = Number(weekday);
      if (Number.isNaN(wd) || wd < 0 || wd > 6) {
        Alert.alert("Día de la semana", "Usa un número de 0 (domingo) a 6 (sábado).");
        return;
      }
    }

    setLoading(true);
    try {
      const schedule =
        kind === "frecuente"
          ? [{ weekday: Number(weekday), start: start.trim(), end: end.trim() }]
          : undefined;
      if (kind === "frecuente") {
        const parsed = parseWeeklySchedule(schedule);
        if (!parsed) {
          Alert.alert("Horario", "Revisa las horas (HH:MM) y que el inicio sea antes del fin.");
          setLoading(false);
          return;
        }
      }

      const payload = {
        guestName: guest,
        plates: plates.trim() || undefined,
        visitType: kind,
        validDay: kind === "frecuente" ? undefined : validDay.trim(),
        schedule,
        startTime: kind !== "frecuente" ? start.trim() : undefined,
        endTime: kind !== "frecuente" ? end.trim() : undefined,
      };

      const saved = editId
        ? await updateVisit(editId, payload)
        : await createVisit(payload);

      if (editId) {
        router.replace(`/(resident)/visit/${saved.id}` as any);
        return;
      }

      setName("");
      setPlates("");
      setKind("eventual");
      setServicioPick(SERVICIO_OPTIONS[0]);
      setPaquetPick(PAQUET_OPTIONS[0]);
      setCustomServicio("");
      setCustomPaquet("");
      setValidDay(formatLocalDateISO(new Date()));
      setStart("08:00");
      setEnd("22:00");
      setEditId(null);
      router.replace(`/(resident)/visit/${saved.id}` as any);
    } catch (error) {
      console.error("Error al guardar visita:", error);
      Alert.alert("Error", editId ? "No se pudo actualizar el pase." : "No se pudo generar el pase. Si tienes adeudo, contacta administración.");
    } finally {
      setLoading(false);
    }
  };

  const renderCategoryPicker = (options: readonly string[], value: string, onPick: (s: string) => void) => (
    <View style={styles.pickerWrap}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => !isDelinquent && onPick(opt)}
          disabled={isDelinquent}
          style={[styles.pickerChip, value === opt && styles.pickerChipOn]}
        >
          <Text style={[styles.pickerChipText, value === opt && styles.pickerChipTextOn]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader
        title={editId ? "Editar pase" : "Nueva visita"}
        right={
          <Pressable
            accessibilityLabel="Historial de pases"
            onPress={openHistory}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="time-outline" size={26} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        {isDelinquent ? (
          <View style={styles.delinquentBanner} accessibilityRole="alert">
            <Text style={styles.delinquentText}>Funcionalidad restringida por adeudo</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Placas (opcional)</Text>
        <TextInput
          style={styles.input}
          value={plates}
          onChangeText={setPlates}
          placeholder="Ej. ABC-123-D"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          editable={!loading && !isDelinquent}
        />

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.kindGrid}>
          {KINDS.map((k) => (
            <Pressable
              key={k.key}
              onPress={() => {
                if (isDelinquent || editId) return;
                setKind(k.key);
                if (k.key === "servicio") {
                  setServicioPick(SERVICIO_OPTIONS[0]);
                  setCustomServicio("");
                  setName(String(SERVICIO_OPTIONS[0]));
                } else if (k.key === "paqueteria") {
                  setPaquetPick(PAQUET_OPTIONS[0]);
                  setCustomPaquet("");
                  setName(String(PAQUET_OPTIONS[0]));
                } else if (k.key === "eventual") {
                  setName("");
                }
              }}
              disabled={isDelinquent || !!editId}
              style={[styles.kindChip, kind === k.key && styles.kindChipOn]}
            >
              <Text style={[styles.kindChipText, kind === k.key && styles.kindChipTextOn]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>

        {kind === "eventual" ? (
          <>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej. Juan Pérez"
              placeholderTextColor={colors.textMuted}
              editable={!loading && !isDelinquent}
            />
          </>
        ) : null}

        {kind === "servicio" ? (
          <>
            <Text style={styles.label}>Proveedor de servicio</Text>
            {renderCategoryPicker(SERVICIO_OPTIONS, servicioPick, (s) => {
              setServicioPick(s);
              if (s !== "Otro") setName(s);
            })}
            {servicioPick === "Otro" ? (
              <>
                <Text style={styles.label}>Especifica el servicio</Text>
                <TextInput
                  style={styles.input}
                  value={customServicio}
                  onChangeText={(t) => {
                    setCustomServicio(t);
                    setName(t);
                  }}
                  placeholder="Describe el proveedor"
                  placeholderTextColor={colors.textMuted}
                  editable={!loading && !isDelinquent}
                />
              </>
            ) : null}
          </>
        ) : null}

        {kind === "paqueteria" ? (
          <>
            <Text style={styles.label}>Paquetería</Text>
            {renderCategoryPicker(PAQUET_OPTIONS, paquetPick, (s) => {
              setPaquetPick(s);
              if (s !== "Otro") setName(s);
            })}
            {paquetPick === "Otro" ? (
              <>
                <Text style={styles.label}>Especifica paquetería</Text>
                <TextInput
                  style={styles.input}
                  value={customPaquet}
                  onChangeText={(t) => {
                    setCustomPaquet(t);
                    setName(t);
                  }}
                  placeholder="Ej. otro courier"
                  placeholderTextColor={colors.textMuted}
                  editable={!loading && !isDelinquent}
                />
              </>
            ) : null}
          </>
        ) : null}

        {kind === "frecuente" ? (
          <>
            <Text style={styles.label}>Nombre del pase frecuente</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej. Empleada doméstica"
              placeholderTextColor={colors.textMuted}
              editable={!loading && !isDelinquent}
            />
          </>
        ) : null}

        {kind !== "frecuente" ? (
          <>
            <Text style={styles.label}>Día del pase</Text>
            <TextInput
              style={styles.input}
              value={validDay}
              onChangeText={setValidDay}
              editable={!loading && !isDelinquent}
            />
            <Text style={styles.label}>Desde (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={start}
              onChangeText={setStart}
              placeholder="08:00"
              placeholderTextColor={colors.textMuted}
              editable={!loading && !isDelinquent}
            />
            <Text style={styles.label}>Hasta (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={end}
              onChangeText={setEnd}
              placeholder="22:00"
              placeholderTextColor={colors.textMuted}
              editable={!loading && !isDelinquent}
            />
          </>
        ) : null}

        {kind === "frecuente" ? (
          <>
            <Text style={styles.label}>Día de la semana (0 = dom … 6 = sáb)</Text>
            <TextInput
              style={styles.input}
              value={weekday}
              onChangeText={setWeekday}
              keyboardType="number-pad"
              editable={!loading && !isDelinquent}
            />
            <Text style={styles.label}>Desde (HH:MM)</Text>
            <TextInput style={styles.input} value={start} onChangeText={setStart} editable={!loading && !isDelinquent} />
            <Text style={styles.label}>Hasta (HH:MM)</Text>
            <TextInput style={styles.input} value={end} onChangeText={setEnd} editable={!loading && !isDelinquent} />
          </>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <View style={[styles.submitWrap, isDelinquent && { opacity: 0.5 }]}>
            <Button
              title={editId ? "Guardar cambios" : "Generar pase QR"}
              variant="primary"
              minHeight={56}
              disabled={isDelinquent}
              onPress={handleSave}
            />
          </View>
        )}
      </ScrollView>

      <Modal visible={historyOpen} animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Historial</Text>
            <Pressable
              onPress={() => setHistoryOpen(false)}
              accessibilityLabel="Cerrar historial"
              hitSlop={14}
              style={styles.closeX}
            >
              <Ionicons name="close-circle" size={36} color={colors.danger} />
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, historyTab === "eventual" && styles.tabOn]}
              onPress={() => setHistoryTab("eventual")}
            >
              <Text style={[styles.tabText, historyTab === "eventual" && styles.tabTextOn]}>Eventuales</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, historyTab === "frecuente" && styles.tabOn]}
              onPress={() => setHistoryTab("frecuente")}
            >
              <Text style={[styles.tabText, historyTab === "frecuente" && styles.tabTextOn]}>Frecuentes</Text>
            </Pressable>
          </View>

          {historyLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={filteredHistory}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listPad}
              ListEmptyComponent={<Text style={styles.empty}>Sin registros en esta pestaña.</Text>}
              renderItem={({ item }) => {
                const b = historyBadgeLabel(item);
                return (
                  <View style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.historyTitleRow}>
                        <Text style={styles.historyName} numberOfLines={1}>
                          {item.guestName}
                        </Text>
                        <View
                          style={[
                            styles.badge,
                            b.tone === "ok" && styles.badgeOk,
                            b.tone === "warn" && styles.badgeWarn,
                            b.tone === "muted" && styles.badgeMuted,
                          ]}
                        >
                          <Text style={styles.badgeText}>{b.text}</Text>
                        </View>
                      </View>
                      <Text style={styles.historyMeta}>
                        {item.visitType}
                        {formatVisitTimeRange(item) ? ` · ${formatVisitTimeRange(item)}` : ""}
                        {" · "}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.historyActions}>
                      {isVisitNotExpired(item) ? (
                        <Pressable
                          style={styles.editBtn}
                          onPress={() => {
                            setHistoryOpen(false);
                            router.push(`/(resident)/visits?editId=${item.id}` as any);
                          }}
                          accessibilityLabel={`Editar pase de ${item.guestName}`}
                        >
                          <Text style={styles.editBtnText}>Editar</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.reSendBtn}
                        onPress={() => applyVisitToForm(item)}
                        accessibilityLabel={`Re-enviar datos de ${item.guestName}`}
                      >
                        <Text style={styles.reSendText}>Re-enviar</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  iconBtn: { padding: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  formScroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 4 },
  delinquentBanner: {
    backgroundColor: colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  delinquentText: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  label: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 18,
    color: colors.text,
    minHeight: 52,
  },
  kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4, marginBottom: 8 },
  kindChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kindChipOn: { borderColor: colors.primary, backgroundColor: "rgba(0, 119, 182, 0.08)" },
  kindChipText: { fontSize: 16, color: colors.text },
  kindChipTextOn: { fontWeight: "800", color: colors.primary },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pickerChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerChipOn: { borderColor: colors.success, backgroundColor: "rgba(76, 175, 80, 0.1)" },
  pickerChipText: { fontSize: 15, color: colors.text },
  pickerChipTextOn: { fontWeight: "800", color: colors.success },
  submitWrap: { marginTop: 24 },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, flex: 1 },
  closeX: { padding: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: colors.surface },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  tabOn: { borderColor: colors.primary, backgroundColor: "rgba(0, 119, 182, 0.08)" },
  tabText: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  tabTextOn: { color: colors.primary, fontWeight: "800" },
  listPad: { padding: 16, paddingBottom: 40 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  historyName: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  historyMeta: { fontSize: 15, color: colors.textMuted, marginTop: 4, textTransform: "capitalize" },
  historyActions: { gap: 8, alignItems: "flex-end" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeOk: { backgroundColor: "rgba(76, 175, 80, 0.2)" },
  badgeWarn: { backgroundColor: "rgba(230, 57, 70, 0.15)" },
  badgeMuted: { backgroundColor: "rgba(0,0,0,0.08)" },
  badgeText: { fontSize: 12, fontWeight: "800", color: colors.text },
  reSendBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  reSendText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  editBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editBtnText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  empty: { textAlign: "center", color: colors.textMuted, fontSize: 16, marginTop: 32 },
});
