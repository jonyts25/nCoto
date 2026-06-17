import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
  Pressable,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import QRCode from "react-native-qrcode-svg";
import { listVisits } from "@/src/features/visits/repo";
import type { Visit } from "@/src/features/visits/types";
import { buildVisitQrPayload, encodeVisitQrPayload } from "@/src/features/visits/qr";
import { formatVisitTimeRange, isVisitNotExpired } from "@/src/features/visits/validation";
import { fetchCurrentUserPropertyIsDelinquent } from "@/src/features/delinquency/repo";
import { fetchCurrentUserProperty } from "@/src/features/properties/repo";
import { fetchCotoById } from "@/src/features/cotos/repo";
import { useAuth } from "@/src/features/auth/useAuth";
import { supabase } from "@/src/lib/supabase";
import { colors } from "@/src/theme/colors";
import { NcotoLogoMark } from "@/src/components/NcotoLogoMark";
import { Button } from "@/src/components/Button";
import { EmergencyConfirmControl } from "@/src/components/EmergencyConfirmControl";
import { Ionicons } from "@expo/vector-icons";

const ACTION_MIN_H = 132;
/** MVP v1 pre-demo: emergencia sin backend — no mostrar en UI. */
const SHOW_EMERGENCY_BUTTON = false;

function pickActiveVisit(visits: Visit[]): Visit | null {
  const now = new Date();
  const candidates = visits.filter((v) => isVisitNotExpired(v, now));
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0] ?? null;
}

function upcomingPasses(visits: Visit[]): Visit[] {
  const now = new Date();
  return visits
    .filter((v) => isVisitNotExpired(v, now))
    .sort((a, b) => {
      const dayA = a.validDay ?? a.validUntil;
      const dayB = b.validDay ?? b.validUntil;
      return dayA.localeCompare(dayB);
    })
    .slice(0, 12);
}

function passDateLabel(v: Visit): string {
  if (v.validDay) return v.validDay;
  return new Date(v.validUntil).toLocaleDateString();
}

export default function ResidentIndex() {
  const { session, profile } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDelinquent, setIsDelinquent] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [cotoName, setCotoName] = useState<string | null>(null);
  const router = useRouter();

  const openAccountMenu = useCallback(() => {
    const email = session?.user?.email ?? "Sin correo";
    const display = profile?.display_name?.trim() || "Sin nombre en perfil";
    Alert.alert(
      "Tu cuenta",
      `${display}\n${email}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await supabase.auth.signOut();
              router.replace("/(auth)/login" as any);
            })();
          },
        },
      ],
      { cancelable: true }
    );
  }, [session, profile, router]);

  useEffect(() => {
    let alive = true;
    const cotoId = profile?.coto_id ?? null;
    if (!cotoId) {
      setBannerUrl(null);
      setCotoName(null);
      return () => {
        alive = false;
      };
    }
    void fetchCotoById(cotoId).then((row) => {
      if (!alive) return;
      setBannerUrl(row?.banner_image_url?.trim() ? row.banner_image_url : null);
      setCotoName(row?.name?.trim() ? row.name : null);
    });
    return () => {
      alive = false;
    };
  }, [profile?.coto_id]);

  useEffect(() => {
    if (!session?.user?.id || !profile?.property_id) return;

    const pid = profile.property_id;
    const channel = supabase
      .channel(`property-delinq:${pid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "properties",
          filter: `id=eq.${pid}`,
        },
        (payload) => {
          const row = payload.new as { is_delinquent?: boolean } | null;
          if (row && typeof row.is_delinquent === "boolean") {
            setIsDelinquent(Boolean(row.is_delinquent));
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[NCoto] Realtime properties:", status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id, profile?.property_id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      (async () => {
        try {
          const [visitList, delinquent, propertyRow] = await Promise.all([
            listVisits(),
            fetchCurrentUserPropertyIsDelinquent(),
            fetchCurrentUserProperty(),
          ]);
          if (!alive) return;
          console.log("[NCoto debug] Propiedad vinculada al usuario (properties row):", propertyRow);
          setVisits(visitList);
          setIsDelinquent(delinquent);
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const activeVisit = useMemo(() => pickActiveVisit(visits), [visits]);
  const upcoming = useMemo(() => upcomingPasses(visits), [visits]);

  const shareActivePass = useCallback(async (visit: Visit) => {
    const payload = encodeVisitQrPayload(buildVisitQrPayload(visit));
    try {
      await Share.share({
        title: "Pase NCoto",
        message: `Pase de acceso NCoto — ${visit.guestName}\n\nPresenta este código en caseta:\n${payload}`,
      });
    } catch (e) {
      console.warn("Share cancelled or failed", e);
    }
  }, []);

  const onEmergencyConfirmed = useCallback(() => {
    Alert.alert(
      "Emergencia",
      "Tu confirmación se registró en la app. Pronto conectaremos el aviso automático a caseta."
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Pressable
          onPress={openAccountMenu}
          hitSlop={12}
          accessibilityLabel="Cuenta y cerrar sesión"
          style={styles.accountBtn}
        >
          <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
          <Text style={styles.accountHint}>Cuenta</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.bannerSlot}>
          {bannerUrl ? (
            <Image source={{ uri: bannerUrl }} style={styles.bannerImg} contentFit="cover" accessibilityLabel="Banner del coto" />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons name="business-outline" size={36} color={colors.primary} />
              <Text style={styles.bannerPlaceholderTitle}>{cotoName ?? "Tu comunidad"}</Text>
              <Text style={styles.bannerPlaceholderSub}>NCoto</Text>
            </View>
          )}
        </View>

        <NcotoLogoMark width={260} />

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <>
            <View style={styles.actionsRow}>
              <View
                style={[styles.actionCell, { minHeight: ACTION_MIN_H }]}
                pointerEvents={isDelinquent ? "none" : "auto"}
              >
                <View style={[styles.actionInner, isDelinquent && styles.actionDimmed]}>
                  <Button
                    title="Generar visita"
                    variant="primary"
                    minHeight={ACTION_MIN_H - 8}
                    disabled={isDelinquent}
                    onPress={() => router.push("/(resident)/visits" as any)}
                  />
                </View>
              </View>
              {SHOW_EMERGENCY_BUTTON ? (
                <View style={[styles.actionCell, { minHeight: ACTION_MIN_H }]}>
                  <EmergencyConfirmControl variant="compact" onConfirmed={onEmergencyConfirmed} />
                </View>
              ) : null}
            </View>

            {isDelinquent ? (
              <View style={styles.delinquentBanner} accessibilityRole="alert">
                <Text style={styles.delinquentText}>Funcionalidad restringida por adeudo</Text>
              </View>
            ) : null}

            <View style={styles.peekSection}>
              <Text style={styles.peekTitle}>Pases próximos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peekScroll}>
                {upcoming.length === 0 ? (
                  <View style={[styles.peekCard, styles.peekEmpty]}>
                    <Text style={styles.peekEmptyText}>Sin pases activos próximos</Text>
                  </View>
                ) : (
                  upcoming.map((v) => (
                    <View key={v.id} style={styles.peekCard}>
                      <Pressable onPress={() => router.push(`/(resident)/visit/${v.id}` as any)}>
                        <Text style={styles.peekGuest} numberOfLines={1}>
                          {v.guestName}
                        </Text>
                        <Text style={styles.peekMeta} numberOfLines={2}>
                          {v.visitType} · {passDateLabel(v)}
                          {formatVisitTimeRange(v) ? `\n${formatVisitTimeRange(v)}` : ""}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.peekEditBtn}
                        onPress={() => router.push(`/(resident)/visits?editId=${v.id}` as any)}
                        accessibilityLabel={`Editar pase de ${v.guestName}`}
                      >
                        <Text style={styles.peekEditText}>Editar</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>

            {activeVisit ? (
              <View style={styles.quickCard} accessibilityLabel={`Pase activo para ${activeVisit.guestName}`}>
                <Text style={styles.quickTitle}>Pase activo</Text>
                <Text style={styles.quickGuest}>{activeVisit.guestName}</Text>
                <View style={styles.qrBox}>
                  <QRCode
                    value={encodeVisitQrPayload(buildVisitQrPayload(activeVisit))}
                    size={112}
                    color={colors.text}
                    backgroundColor={colors.surface}
                  />
                </View>
                <View style={styles.quickActions}>
                  <Pressable
                    style={styles.linkBtn}
                    onPress={() => router.push(`/(resident)/visit/${activeVisit.id}` as any)}
                  >
                    <Text style={styles.linkBtnText}>Ver pantalla completa</Text>
                    <Ionicons name="open-outline" size={18} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    style={styles.editOutlineBtn}
                    onPress={() => router.push(`/(resident)/visits?editId=${activeVisit.id}` as any)}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                    <Text style={styles.editOutlineText}>Editar pase</Text>
                  </Pressable>
                  <Pressable style={styles.shareBtn} onPress={() => shareActivePass(activeVisit)}>
                    <Ionicons name="share-outline" size={22} color="#fff" />
                    <Text style={styles.shareBtnText}>Enviar código</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  topBarSide: { width: 8 },
  accountBtn: { alignItems: "center", paddingVertical: 4, paddingHorizontal: 8 },
  accountHint: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 4,
    gap: 12,
  },
  bannerSlot: {
    marginBottom: 4,
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 96,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerImg: { width: "100%", height: 104 },
  bannerPlaceholder: {
    minHeight: 96,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 119, 182, 0.06)",
  },
  bannerPlaceholderTitle: { marginTop: 6, fontSize: 17, fontWeight: "800", color: colors.primary },
  bannerPlaceholderSub: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  loader: { marginTop: 40 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionCell: { flex: 1, justifyContent: "center" },
  actionInner: { flex: 1, justifyContent: "center" },
  actionDimmed: { opacity: 0.5 },
  delinquentBanner: {
    marginTop: 4,
    backgroundColor: colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  delinquentText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  peekSection: { marginTop: 8 },
  peekTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 8 },
  peekScroll: { gap: 10, paddingBottom: 4 },
  peekCard: {
    width: 168,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  peekEmpty: { justifyContent: "center", borderStyle: "dashed" },
  peekEmptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  peekGuest: { fontSize: 15, fontWeight: "800", color: colors.text },
  peekMeta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  peekEditBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  peekEditText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  quickCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickTitle: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  quickGuest: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 4 },
  qrBox: {
    alignSelf: "center",
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  quickActions: { marginTop: 16, gap: 10 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  linkBtnText: { fontSize: 16, fontWeight: "600", color: colors.primary },
  editOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editOutlineText: { fontSize: 16, fontWeight: "700", color: colors.primary },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
