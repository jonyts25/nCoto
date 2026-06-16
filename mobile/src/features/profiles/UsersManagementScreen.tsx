import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Modal,
  Alert,
  TextInput,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useAuth } from "@/src/features/auth/useAuth";
import { userRoleLabelEs } from "@/src/features/auth/roleLabels";
import {
  listProfilesForCurrentCoto,
  updateUserRole,
  createUserViaEdgeFunction,
  listAllCotos,
  type ProfileRow,
} from "@/src/features/profiles/repo";
import type { UserAppRole } from "@/src/features/visits/types";
import { SuperCotoSelector } from "@/src/features/profiles/SuperCotoSelector";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { colors } from "@/src/theme/colors";

const ASSIGNABLE_LOW: { value: "resident" | "guard" | "board_member"; label: string }[] = [
  { value: "resident", label: "Residente" },
  { value: "guard", label: "Guardia" },
  { value: "board_member", label: "Mesa directiva" },
];

function assignablePickerRoles(userRole: UserAppRole): ("resident" | "guard" | "board_member")[] {
  if (userRole === "admin" || userRole === "coto_admin") {
    return ["resident", "guard", "board_member"];
  }
  return ["resident", "guard"];
}

export default function UsersManagementScreen() {
  const { session, userRole, profile, refetchProfile } = useAuth();
  const { scopeVersion, refreshScope, effectiveCotoId } = useCotoScope();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<UserAppRole>("resident");
  const [createCotoId, setCreateCotoId] = useState<string>("");
  const [createPassword, setCreatePassword] = useState("");
  const [allCotos, setAllCotos] = useState<{ id: string; name: string }[]>([]);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [cotoPickerOpen, setCotoPickerOpen] = useState(false);

  const canManageUsers =
    userRole === "admin" || userRole === "coto_admin" || userRole === "resident";

  const load = useCallback(() => {
    if (!canManageUsers) return;
    setLoading(true);
    listProfilesForCurrentCoto()
      .then(setRows)
      .catch((e) => {
        console.error(e);
        Alert.alert("Error", e?.message ?? "No se pudieron cargar los perfiles.");
      })
      .finally(() => setLoading(false));
  }, [canManageUsers, scopeVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (userRole !== "admin") return;
      listAllCotos()
        .then((c) => setAllCotos(c.map((x) => ({ id: x.id, name: x.name }))))
        .catch(() => {});
    }, [userRole])
  );

  const openCreate = async () => {
    setCreateEmail("");
    setCreateName("");
    setCreatePassword("");
    setCreateRole("resident");
    if (userRole === "admin") {
      let list = allCotos;
      if (!list.length) {
        try {
          const fetched = await listAllCotos();
          list = fetched.map((x) => ({ id: x.id, name: x.name }));
          setAllCotos(list);
        } catch {
          list = [];
        }
      }
      setCreateCotoId(effectiveCotoId ?? list[0]?.id ?? "");
    } else {
      setCreateCotoId(profile?.coto_id ?? effectiveCotoId ?? "");
    }
    setCreateOpen(true);
  };

  const allowedCreateRoles = (): UserAppRole[] => {
    if (userRole === "admin") return ["resident", "guard", "admin", "coto_admin", "board_member"];
    if (userRole === "coto_admin") return ["resident", "guard", "board_member"];
    return ["resident"];
  };

  async function submitCreate() {
    const email = createEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Error", "Correo inválido.");
      return;
    }
    const coto = createCotoId.trim();
    if (!coto) {
      Alert.alert("Error", "Selecciona un coto.");
      return;
    }
    const perms = allowedCreateRoles();
    if (!perms.includes(createRole)) {
      Alert.alert("Error", "No tienes permiso para ese rol.");
      return;
    }
    setSaving(true);
    try {
      await createUserViaEdgeFunction({
        email,
        display_name: createName.trim() || undefined,
        role: createRole,
        coto_id: coto,
        password: createPassword.trim() || undefined,
      });
      Alert.alert("Listo", "Usuario creado. Puede iniciar sesión con su correo.");
      setCreateOpen(false);
      await refreshScope();
      load();
      await refetchProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al crear usuario.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  async function onPickRole(row: ProfileRow, next: "resident" | "guard" | "board_member") {
    if (row.role === "admin" || row.role === "coto_admin") {
      Alert.alert("Rol", "Este rol se gestiona con cuidado desde administración.");
      setPickerFor(null);
      return;
    }
    if (next === row.role) {
      setPickerFor(null);
      return;
    }
    if (userRole === "resident") {
      Alert.alert("Permiso", "No puedes cambiar roles desde aquí.");
      return;
    }
    setSaving(true);
    try {
      await updateUserRole(row.id, next);
      setPickerFor(null);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo actualizar el rol.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  if (!canManageUsers) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Usuarios" />
        <View style={styles.centered}>
          <Text style={styles.muted}>No tienes permiso para esta sección.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Usuarios" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.success} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {userRole === "admin" ? <SuperCotoSelector /> : null}

      <ScreenHeader
        title="Usuarios"
        right={
          <Pressable
            accessibilityLabel="Agregar usuario"
            onPress={openCreate}
            style={({ pressed }) => [styles.addBtnCompact, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="person-add-outline" size={22} color="#fff" />
          </Pressable>
        }
      />
      <Pressable onPress={openCreate} style={styles.addLabelRow}>
        <Text style={styles.addLabelText}>Agregar usuario</Text>
      </Pressable>
      <Text style={styles.sub}>
        Roles en pantalla: nombres amigables; en base de datos se guardan en inglés (resident, guard,
        admin…).
      </Text>

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const isSelf = session?.user?.id === item.id;
          const disabled = item.role === "admin" || item.role === "coto_admin";
          const canChangeRole = userRole === "admin" || userRole === "coto_admin";
          return (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.display_name || item.id.slice(0, 8) + "…"}</Text>
                <Text style={styles.meta}>
                  {isSelf ? "Tú · " : ""}
                  {item.id}
                </Text>
              </View>
              <Pressable
                style={[styles.roleChip, (disabled || !canChangeRole) && styles.roleChipDisabled]}
                onPress={() => canChangeRole && !disabled && setPickerFor(item)}
                disabled={disabled || !canChangeRole}
              >
                <Text style={styles.roleChipText}>{userRoleLabelEs(item.role)}</Text>
                {canChangeRole && !disabled && <Text style={styles.chev}>▾</Text>}
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No hay perfiles visibles.</Text>}
      />

      <Modal visible={pickerFor != null} transparent animationType="fade">
        <SafeAreaView style={styles.modalSafeOuter} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.modalWrap}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.modalDim]}
            onPress={() => !saving && setPickerFor(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rol de usuario</Text>
            {assignablePickerRoles(userRole).map((value) => {
              const opt = ASSIGNABLE_LOW.find((o) => o.value === value)!;
              return (
                <Pressable
                  key={value}
                  style={styles.modalOption}
                  disabled={saving}
                  onPress={() => pickerFor && onPickRole(pickerFor, value)}
                >
                  <Text style={styles.modalOptionText}>{opt.label}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.modalCancel} onPress={() => setPickerFor(null)} disabled={saving}>
              <Text>Cancelar</Text>
            </Pressable>
            {saving && <ActivityIndicator style={{ marginTop: 12 }} />}
          </View>
        </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={createOpen} transparent animationType="slide">
        <SafeAreaView style={styles.modalSafeOuter} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.modalWrap}>
          <Pressable style={[StyleSheet.absoluteFill, styles.modalDim]} onPress={() => !saving && setCreateOpen(false)} />
          <View style={[styles.modalCard, { maxHeight: "90%" }]}>
            <View style={styles.modalTopBar}>
              <View style={{ width: 40 }} />
              <Text style={styles.modalTitleCenter}>Nuevo usuario</Text>
              <Pressable
                accessibilityLabel="Cerrar"
                hitSlop={12}
                onPress={() => !saving && setCreateOpen(false)}
                style={styles.closeRound}
              >
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.lab}>Correo</Text>
              <TextInput
                style={styles.input}
                value={createEmail}
                onChangeText={setCreateEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="correo@dominio.com"
              />
              <Text style={styles.lab}>Nombre (opcional)</Text>
              <TextInput style={styles.input} value={createName} onChangeText={setCreateName} placeholder="Nombre visible" />
              <Text style={styles.lab}>Contraseña (opcional)</Text>
              <TextInput
                style={styles.input}
                value={createPassword}
                onChangeText={setCreatePassword}
                secureTextEntry
                placeholder="Si omites, el usuario usa recuperación / enlace"
              />

              <Text style={styles.lab}>Rol</Text>
              <Pressable style={styles.input} onPress={() => setRolePickerOpen(true)}>
                <Text>{userRoleLabelEs(createRole)}</Text>
              </Pressable>

              {userRole === "admin" ? (
                <>
                  <Text style={styles.lab}>Coto destino</Text>
                  <Pressable style={styles.input} onPress={() => setCotoPickerOpen(true)}>
                    <Text>{allCotos.find((c) => c.id === createCotoId)?.name ?? "Elegir coto"}</Text>
                  </Pressable>
                </>
              ) : null}

              <Pressable
                style={[styles.addBtn, { marginTop: 16 }]}
                onPress={submitCreate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.addBtnText}>Crear usuario</Text>
                )}
              </Pressable>
              <Pressable style={styles.modalCancel} onPress={() => setCreateOpen(false)} disabled={saving}>
                <Text>Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={rolePickerOpen} transparent>
        <SafeAreaView style={styles.modalSafeOuter} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.modalWrap}>
          <Pressable style={[StyleSheet.absoluteFill, styles.modalDim]} onPress={() => setRolePickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Elegir rol</Text>
            {allowedCreateRoles().map((r) => (
              <Pressable
                key={r}
                style={styles.modalOption}
                onPress={() => {
                  setCreateRole(r);
                  setRolePickerOpen(false);
                }}
              >
                <Text style={styles.modalOptionText}>{userRoleLabelEs(r)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={cotoPickerOpen} transparent>
        <SafeAreaView style={styles.modalSafeOuter} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.modalWrap}>
          <Pressable style={[StyleSheet.absoluteFill, styles.modalDim]} onPress={() => setCotoPickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Elegir coto</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {allCotos.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setCreateCotoId(c.id);
                    setCotoPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  muted: { color: "#666" },
  addBtnCompact: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: { backgroundColor: "#34C759", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: "#fff", fontWeight: "700" },
  addLabelRow: { paddingHorizontal: 20, paddingBottom: 8 },
  addLabelText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  sub: { fontSize: 12, color: "#666", paddingHorizontal: 20, marginBottom: 8, marginTop: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowText: { flex: 1, marginRight: 12 },
  name: { fontSize: 16, fontWeight: "600", color: "#222" },
  meta: { fontSize: 11, color: "#999", marginTop: 4 },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#34C759",
    backgroundColor: "#f0fff4",
  },
  roleChipDisabled: { opacity: 0.6 },
  roleChipText: { fontSize: 14, fontWeight: "600", color: "#1a7f37" },
  chev: { fontSize: 12, color: "#1a7f37" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  modalSafeOuter: { flex: 1, backgroundColor: "transparent" },
  modalWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalDim: { backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    zIndex: 1,
  },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitleCenter: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: colors.text },
  closeRound: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  modalOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalOptionText: { fontSize: 16 },
  modalCancel: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  lab: { fontSize: 13, color: "#555", marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
});
