import { View, Text, StyleSheet, ActivityIndicator, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  loadVisitForSecurityScreen,
  mapAccessReasonToMessage,
  peekVisitAccessAction,
  registerVisitAccess,
} from "@/src/features/visits/repo";
import { AppButton } from "@/src/components/AppButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import type { PeekVisitAccessAction, Visit } from "@/src/features/visits/types";
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

function confirmButtonTitle(peek: PeekVisitAccessAction, visit: Visit): string {
  if (peek.action === "exit") return "Registrar salida";
  if (peek.usageMode === "cycle") return "Registrar entrada";
  if ((visit.visitType ?? "eventual") === "paqueteria") return "Confirmar ingreso";
  return "Registrar ingreso";
}

function successMessage(action: "entry" | "exit", visit: Visit): string {
  if (action === "exit") return "Salida registrada.";
  if ((visit.visitType ?? "eventual") === "frecuente") {
    return "Entrada registrada. El pase frecuente sigue vigente según su horario.";
  }
  if ((visit.visitType ?? "eventual") === "paqueteria") {
    return "Ingreso de paquetería registrado.";
  }
  return "Ingreso registrado.";
}

export default function SecurityVisitValidation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [accessPeek, setAccessPeek] = useState<PeekVisitAccessAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadKind, setLoadKind] = useState<
    "ok" | "not_found" | "rls_denied" | "rpc_unavailable" | "error" | "idle"
  >("idle");
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [entryBlockedMessage, setEntryBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setLoadKind("not_found");
      return;
    }

    let cancelled = false;
    setVisit(null);
    setAccessPeek(null);
    setLoading(true);
    setLoadKind("idle");
    setLoadDetail(null);
    setEntryBlockedMessage(null);

    void (async () => {
      const result = await loadVisitForSecurityScreen(String(id));
      if (cancelled) return;

      switch (result.kind) {
        case "ok": {
          const v = result.visit;
          const peekResult = await peekVisitAccessAction(String(id));
          if (cancelled) return;

          if (peekResult.error || !peekResult.peek) {
            setVisit(null);
            setLoadKind("error");
            setLoadDetail(peekResult.error ?? "No se pudo verificar el acceso del pase.");
            setLoading(false);
            return;
          }

          const peek = peekResult.peek;
          const allowsExit = peek.action === "exit" && peek.canRegister;

          if (!allowsExit) {
            const validation = canValidateVisitNow(v);
            if (!validation.ok) {
              setVisit(null);
              setLoadKind("error");
              setLoadDetail(validation.reason);
              setLoading(false);
              return;
            }
          }

          if (!peek.canRegister && peek.reason === "mora" && peek.action !== "exit") {
            setVisit(v);
            setAccessPeek(peek);
            setEntryBlockedMessage("Unidad en mora: no se puede registrar entrada.");
            setLoadKind("ok");
            setLoading(false);
            return;
          }

          if (!peek.canRegister && peek.action !== "exit") {
            setVisit(null);
            setLoadKind("error");
            setLoadDetail(mapAccessReasonToMessage(peek.reason));
            setLoading(false);
            return;
          }

          if (peek.action === "blocked") {
            setVisit(null);
            setLoadKind("error");
            setLoadDetail(mapAccessReasonToMessage(peek.reason));
            setLoading(false);
            return;
          }

          setVisit(v);
          setAccessPeek(peek);
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
    if (!id || !visit || !accessPeek || submitting) return;
    if (entryBlockedMessage) {
      Alert.alert("No permitido", entryBlockedMessage);
      return;
    }
    if (!accessPeek.canRegister || accessPeek.action === "blocked") {
      Alert.alert("No permitido", mapAccessReasonToMessage(accessPeek.reason));
      return;
    }

    const allowsExit = accessPeek.action === "exit" && accessPeek.canRegister;
    if (!allowsExit) {
      const gate = canValidateVisitNow(visit);
      if (!gate.ok) {
        Alert.alert("No permitido", gate.reason);
        return;
      }
    }

    try {
      setSubmitting(true);
      const result = await registerVisitAccess(id, visit.plates, visit.note);
      const msg = successMessage(result.action, visit);
      Alert.alert(result.action === "exit" ? "Salida registrada" : "Ingreso registrado", msg, [
        { text: "OK", onPress: () => router.replace("/(security)" as any) },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo registrar el acceso.";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

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

  if (!visit || !accessPeek) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right", "bottom"]}>
        <ScreenHeader title="Validación" />
        <Text style={styles.body}>No se pudo mostrar el pase.</Text>
      </SafeAreaView>
    );
  }

  const gate = canValidateVisitNow(visit);
  const canConfirm =
    accessPeek.canRegister &&
    accessPeek.action !== "blocked" &&
    !entryBlockedMessage &&
    (accessPeek.action === "exit" || (visit.status === "active" && gate.ok));

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader title="Validación de pase" />
      {entryBlockedMessage ? (
        <View style={styles.blockBanner}>
          <Text style={styles.blockBannerText}>{entryBlockedMessage}</Text>
        </View>
      ) : null}
      {accessPeek.isDelinquent && accessPeek.action === "exit" ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText}>Unidad en mora — se permite registrar salida.</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        {accessPeek.usageMode === "cycle" && accessPeek.presence ? (
          <View
            style={[
              styles.presenceBadge,
              accessPeek.presence === "inside" ? styles.presenceInside : styles.presenceOutside,
            ]}
          >
            <Text style={styles.presenceBadgeText}>
              {accessPeek.presence === "inside" ? "DENTRO" : "FUERA"}
            </Text>
          </View>
        ) : null}
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
        {!gate.ok && accessPeek.action !== "exit" && (
          <Text style={styles.warn}>{gate.reason}</Text>
        )}
        {!accessPeek.canRegister && accessPeek.reason && accessPeek.action !== "exit" ? (
          <Text style={styles.warn}>{mapAccessReasonToMessage(accessPeek.reason)}</Text>
        ) : null}
      </View>

      {canConfirm && (
        <AppButton
          title={confirmButtonTitle(accessPeek, visit)}
          onPress={handleConfirm}
          disabled={submitting}
        />
      )}
      {submitting ? <ActivityIndicator style={{ marginTop: 16 }} size="small" color="#FF3B30" /> : null}
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
  blockBanner: { backgroundColor: "#FFEBEE", padding: 12, borderRadius: 10, marginBottom: 12 },
  blockBannerText: { color: "#B71C1C", fontSize: 14, textAlign: "center", fontWeight: "600" },
  warnBanner: { backgroundColor: "#FFF3E0", padding: 12, borderRadius: 10, marginBottom: 12 },
  warnBannerText: { color: "#E65100", fontSize: 13, textAlign: "center" },
  presenceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  presenceOutside: { backgroundColor: "#E3F2FD" },
  presenceInside: { backgroundColor: "#E8F5E9" },
  presenceBadgeText: { fontSize: 14, fontWeight: "800", color: "#333" },
});
