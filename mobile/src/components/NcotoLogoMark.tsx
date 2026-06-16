import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "@/src/theme/colors";

type Props = {
  /** Ancho del bloque de marca (px) */
  width?: number;
  compact?: boolean;
};

/**
 * Marca visual inspirada en el logo NCoto (circuito + confianza).
 * Sustituir por `Image` si se añade el PNG oficial en `assets/`.
 */
export function NcotoLogoMark({ width = 200, compact = false }: Props) {
  const h = compact ? 48 : 72;
  const svgW = compact ? 44 : 56;

  return (
    <View style={[styles.wrap, { width }]} accessibilityRole="header">
      <Svg width={svgW} height={h * 0.85} viewBox="0 0 56 48">
        <Circle cx="28" cy="24" r="20" stroke={colors.primary} strokeWidth="3" fill="none" />
        <Path
          d="M 14 24 L 22 18 L 22 30 Z"
          fill={colors.primary}
          opacity={0.95}
        />
        <Path
          d="M 26 16 L 42 24 L 26 32 Z"
          fill={colors.success}
          opacity={0.9}
        />
        <Circle cx="44" cy="12" r="3" fill={colors.success} />
        <Circle cx="10" cy="36" r="2.5" fill={colors.primary} />
      </Svg>
      {!compact && (
        <View style={styles.wordmark}>
          <Text style={styles.brand}>NCoto</Text>
          <Text style={styles.tagline}>Acceso seguro</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
  },
  wordmark: {
    alignItems: "center",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: "500",
    marginTop: 2,
  },
});
