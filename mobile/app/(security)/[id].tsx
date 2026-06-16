import { View, Text, StyleSheet, ActivityIndicator, Alert, Pressable, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  loadVisitForSecurityScreen,
  markVisitUsed,
  peekVisitResidentIsDelinquent,
} from "@/src/features/visits/repo";
import { AppButton } from "@/src/components/AppButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import type { Visit } from "@/src/features/visits/types";
import { canValidateVisitNow, formatVisitTimeRange } from "@/src/features/visits/validation";

function typeLabel(v: Visit): string {
  switch (v.visitType ?? "eventual") {
    case "eventual":
      return "Eventual";
    case "frecuente":
      return "Frecuente";
    case "servicio":
      return "Servicio";
    case "paqueteria":
      return "Paquetería";
    default:
      return "Visita";
  }
}

export default function SecurityVisitValidation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadKind, setLoadKind] = useState<
    "ok" | "not_found" | "rls_denied" | "rpc_unavailable" | "error" | "idle"
  >("idle");
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [blockedDelinquentVisit, setBlockedDelinquentVisit] = useState<Visit | null>(null);
  const [delinquentCheckError, setDelinquentCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setLoadKind("not_found");
      return;
    }

    let cancelled = false;
    setVisit(null);
    setLoading(true);
    setLoadKind("idle");
    setLoadDetail(null);
    setBlockedDelinquentVisit(null);
    setDelinquentCheckError(null);

    void (async () => {
      const result = await loadVisitForSecurityScreen(String(id));
      if (cancelled) return;

      switch (result.kind) {
        case "ok": {
          const v = result.visit;
          const validation = canValidateVisitNow(v);
          if (!validation.ok) {
            setVisit(null);
            setLoadKind("error");
            setLoadDetail(validation.reason);
            setLoading(false);
            return;
          }

          const mora = await peekVisitResidentIsDelinquent(String(id));
          if (cancelled) return;
          if (mora.error) {
            setDelinquentCheckError(mora.error);
          }
          if (mora.delinquent) {
            setBlockedDelinquentVisit(v);
            setVisit(null);
            setLoadKind("ok");
            setLoading(false);
            return;
          }

          setVisit(v);
          setLoadKind("ok");
          setLoading(false);
          return;
        }
        case "not_found":
          setVisit(null);
          setLoadKind("not_found");
          break;
        case "rls_denied":
          setVisit(null);
          setLoadKind("rls_denied");
          break;
        case "rpc_unavailable":
          setVisit(null);
          setLoadKind("rpc_unavailable");
          break;
        case "error":
          setVisit(null);
          setLoadKind("error");
          setLoadDetail(result.message);
          break;
        default:
          setLoadKind("error");
          setLoadDetail("Respuesta inesperada del servidor.");
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleConfirm = async () => {
    if (!id || !visit) return;
    const gate = canValidateVisitNow(visit);
    if (!gate.ok) {
      Alert.alert("No permitido", gate.reason);
      return;
    }
    try {
      setLoading(true);
      await markVisitUsed(id);
      setLoading(false);
      const msg =
        (visit.visitType ?? "eventual") === "frecuente"
          ? "Acceso registrado. El pase frecuente sigue vigente según su horario."
          : (visit.visitType ?? "eventual") === "paqueteria"
            ? "Ingreso de paquetería registrado."
            : "El pase ha sido registrado correctamente.";
      Alert.alert("Acceso concedido", msg, [
        { text: "OK", onPress: () => router.replace("/(security)" as any) },
      ]);
    } catch {
      Alert.alert("Error", "No se pudo registrar la entrada.");
      setLoading(false);
    }
  };

  if (blockedDelinquentVisit) {
    return (
      <Modal visible animationType="fade" presentationStyle="fullScreen">
        <SafeAreaView style={styles.blockRoot} edges={["top", "left", "right", "bottom"]}>
          <Text style={styles.blockTitle}>ACCESO DENEGADO</Text>
          <Text style={styles.blockSub}>Unidad en mora — contactar administración</Text>
          <Text style={styles.blockBody}>
            El ingreso queda bloqueado por adeudos del residente titular del pase. Visitante:{" "}
            {blockedDelinquentVisit.guestName}
          </Text>
          <Text style={styles.blockId}>Pase {String(id).slice(0, 8)}…</Text>
          <Pressable style={styles.blockBtn} onPress={() => router.replace("/(security)" as any)}>
            <Text style={styles.blockBtnText}>Volver al escáner</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  }

  if (loading && loadKind === "idle") {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <ActivityIndicator style={{ marginTop: 24 }} size="large" color="#FF3B30" />
        <Text style={styles.muted}>Cargando pase…</Text>
      </SafeAreaView>
    );
  }

  if (!loading && loadKind === "not_found") {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.errorTitle}>Pase no encontrado</Text>
        <Text style={styles.body}>
          No hay un pase activo con este código. Puede haber sido eliminado, el enlace es incorrecto o el
          identificador no es válido.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(security)" as any)}>
          <Text style={styles.secondaryBtnText}>Volver al escáner</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!loading && loadKind === "rls_denied") {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.errorTitle}>Sin acceso a este pase (RLS)</Text>
        <Text style={styles.body}>
          El pase existe en el sistema, pero tu usuario no puede leerlo con las políticas actuales de Supabase.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(security)" as any)}>
          <Text style={styles.secondaryBtnText}>Volver al escáner</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!loading && loadKind === "rpc_unavailable") {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.warnTitle}>No se puede verificar permisos</Text>
        <Text style={styles.body}>
          Falta la función RPC «peek_visit_exists_for_security» en el proyecto Supabase. Aplica las migraciones
          recientes y vuelve a intentar.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(security)" as any)}>
          <Text style={styles.secondaryBtnText}>Volver al escáner</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!loading && loadKind === "error") {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.errorTitle}>Error al cargar</Text>
        <Text style={styles.body}>{loadDetail ?? "Intenta de nuevo en unos segundos."}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(security)" as any)}>
          <Text style={styles.secondaryBtnText}>Volver al escáner</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.body}>No se pudo mostrar el pase.</Text>
      </SafeAreaView>
    );
  }

  const gate = canValidateVisitNow(visit);
  const canConfirm = visit.status === "active" && gate.ok;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader title="Validación de pase" />
      {delinquentCheckError ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText}>Aviso morosidad (verificación): {delinquentCheckError}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Tipo:</Text>
        <Text style={styles.value}>{typeLabel(visit)}</Text>
        <Text style={styles.label}>Visitante:</Text>
        <Text style={styles.value}>{visit.guestName}</Text>
        {!!visit.validDay && (
          <>
            <Text style={styles.label}>Día autorizado:</Text>
            <Text style={styles.value}>{visit.validDay}</Text>
          </>
        )}
        {formatVisitTimeRange(visit) ? (
          <>
            <Text style={styles.label}>Horario:</Text>
            <Text style={styles.value}>{formatVisitTimeRange(visit)}</Text>
          </>
        ) : null}
        <Text style={styles.label}>Estatus:</Text>
        <Text style={[styles.value, { color: visit.status === "active" ? "#34C759" : "#FF3B30" }]}>
          {visit.status === "active" ? "Válido" : "Pase expirado o usado"}
        </Text>
        {!gate.ok && <Text style={styles.warn}>{gate.reason}</Text>}
      </View>

      {visit.status === "active" && canConfirm && (
        <AppButton
          title={(visit.visitType ?? "eventual") === "paqueteria" ? "Confirmar ingreso" : "Confirmar entrada"}
          onPress={handleConfirm}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f8f9fa" },
  centered: { flex: 1, padding: 24, backgroundColor: "#f8f9fa", justifyContent: "center" },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 12, marginBottom: 30, elevation: 2 },
  label: { fontSize: 14, color: "#666", marginTop: 10 },
  value: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  warn: { marginTop: 12, color: "#FF3B30", fontSize: 14 },
  muted: { marginTop: 16, color: "#666", fontSize: 14 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#FF3B30", marginBottom: 12, textAlign: "center" },
  warnTitle: { fontSize: 20, fontWeight: "700", color: "#C47F00", marginBottom: 12, textAlign: "center" },
  body: { fontSize: 16, color: "#444", lineHeight: 22, textAlign: "center", marginBottom: 20 },
  secondaryBtn: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  secondaryBtnText: { color: "#FF3B30", fontWeight: "600", fontSize: 16 },
  blockRoot: {
    flex: 1,
    backgroundColor: "#B71C1C",
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  blockTitle: {
    color: "#FFEB3B",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  blockSub: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  blockBody: { color: "rgba(255,255,255,0.95)", fontSize: 16, lineHeight: 24, textAlign: "center" },
  blockId: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 12 },
  blockBtn: {
    marginTop: 32,
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  blockBtnText: { color: "#B71C1C", fontWeight: "800", fontSize: 16 },
  warnBanner: { backgroundColor: "#FFF3E0", padding: 12, borderRadius: 10, marginBottom: 12 },
  warnBannerText: { color: "#E65100", fontSize: 13, textAlign: "center" },
});
