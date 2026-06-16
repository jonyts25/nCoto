import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, ScrollView } from "react-native";
import { useCotoScope } from "@/src/context/CotoScopeContext";
import { useState } from "react";

/**
 * Selector de coto activo para superadmin (role admin en BD).
 * Actualiza profiles.active_coto_id y el contexto global.
 */
export function SuperCotoSelector() {
  const { isSuperadmin, cotos, cotosLoading, effectiveCotoId, setActiveCotoId } = useCotoScope();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isSuperadmin) return null;

  const label = cotos.find((c) => c.id === effectiveCotoId)?.name ?? "Coto";

  async function pick(id: string) {
    if (id === effectiveCotoId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setActiveCotoId(id);
      setOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Coto activo (vista global)</Text>
      <Pressable style={styles.btn} onPress={() => setOpen(true)} disabled={cotosLoading}>
        {cotosLoading ? (
          <ActivityIndicator color="#1a7f37" />
        ) : (
          <>
            <Text style={styles.btnText} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.chev}>▾</Text>
          </>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => !busy && setOpen(false)} />
          <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Seleccionar coto</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {cotos.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.opt, c.id === effectiveCotoId && styles.optOn]}
                onPress={() => pick(c.id)}
                disabled={busy}
              >
                <Text style={styles.optText}>{c.name}</Text>
                {c.slug ? <Text style={styles.slug}>{c.slug}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={() => setOpen(false)} disabled={busy}>
            <Text>Cerrar</Text>
          </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#f4fbf6", borderBottomWidth: 1, borderBottomColor: "#ddeee0" },
  hint: { fontSize: 12, color: "#555", marginBottom: 6 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#34C759",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  btnText: { flex: 1, fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
  chev: { fontSize: 14, color: "#34C759" },
  modalRoot: { flex: 1, justifyContent: "center", padding: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    zIndex: 1,
    marginHorizontal: 0,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    elevation: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  opt: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  optOn: { backgroundColor: "#e8f8ec" },
  optText: { fontSize: 16, fontWeight: "600" },
  slug: { fontSize: 12, color: "#888", marginTop: 2 },
  cancel: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
});
