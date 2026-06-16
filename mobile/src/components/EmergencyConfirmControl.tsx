import { useCallback, useMemo, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme/colors";

const LONG_PRESS_MS = 3000;

type Props = {
  onConfirmed: () => void;
  /** `compact` reduce tamaño para layout en dos columnas (home). */
  variant?: "default" | "compact";
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  android: { elevation: 6 },
  default: {},
});

/**
 * Emergencia: solo pulsación prolongada (3 s) sobre el botón circular.
 * No depende de morosidad.
 */
export function EmergencyConfirmControl({ onConfirmed, variant = "default" }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const dim = useMemo(() => {
    if (variant === "compact") {
      return {
        circle: 120,
        title: 28,
        sub: 13,
        hint: 13,
        barW: "100%" as const,
        barMax: 220,
      };
    }
    return {
      circle: 168,
      title: 36,
      sub: 15,
      hint: 16,
      barW: "88%" as const,
      barMax: 320,
    };
  }, [variant]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
  }, []);

  const fireConfirm = useCallback(() => {
    clearTimers();
    progress.setValue(0);
    onConfirmed();
  }, [clearTimers, onConfirmed, progress]);

  const handlePressIn = () => {
    clearTimers();
    startRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(1, elapsed / LONG_PRESS_MS);
      progress.setValue(p);
    }, 32);
    timerRef.current = setTimeout(() => {
      fireConfirm();
    }, LONG_PRESS_MS);
  };

  const handlePressOut = () => {
    clearTimers();
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const r = dim.circle / 2;

  return (
    <View style={[styles.block, variant === "compact" && styles.blockCompact]}>
      <Text style={[styles.hint, { fontSize: dim.hint }]}>Mantén {LONG_PRESS_MS / 1000} s</Text>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.circle,
          cardShadow,
          {
            width: dim.circle,
            height: dim.circle,
            borderRadius: r,
            borderWidth: variant === "compact" ? 3 : 4,
          },
          pressed && styles.circlePressed,
        ]}
        accessibilityLabel={`Emergencia. Mantén presionado ${LONG_PRESS_MS / 1000} segundos para confirmar.`}
      >
        <Text style={[styles.circleTitle, { fontSize: dim.title }]}>SOS</Text>
        <Text style={[styles.circleSub, { fontSize: dim.sub }]}>Emergencia</Text>
      </Pressable>

      <View style={[styles.barTrack, { width: dim.barW, maxWidth: dim.barMax }]}>
        <Animated.View style={[styles.barFill, { width: progressWidth }]} />
      </View>
      <Text style={styles.barCaption}>Confirmación…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "center", gap: 12, paddingVertical: 8 },
  blockCompact: { gap: 8, paddingVertical: 4 },
  hint: {
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  circle: {
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.95)",
  },
  circlePressed: { transform: [{ scale: 0.98 }] },
  circleTitle: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  circleSub: { color: "rgba(255,255,255,0.95)", fontWeight: "700", marginTop: 2 },
  barTrack: {
    marginTop: 4,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  barCaption: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
});
