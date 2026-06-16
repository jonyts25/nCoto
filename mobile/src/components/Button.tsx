import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { colors } from "@/src/theme/colors";

const RADIUS = 14;

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  android: { elevation: 4 },
  default: {},
});

export type ButtonVariant = "primary" | "danger" | "secondary" | "outline";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  minHeight?: number;
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  disabled,
  minHeight = 48,
  ...pressable
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const palette = variantStyles[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...pressable}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        cardShadow,
        {
          minHeight,
          borderRadius: RADIUS,
          backgroundColor: palette.bg,
          borderWidth: palette.borderW,
          borderColor: palette.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.92 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.indicator} />
      ) : (
        <Text style={[styles.label, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const variantStyles: Record<
  ButtonVariant,
  { bg: string; fg: string; border: string; borderW: number; indicator: string }
> = {
  primary: {
    bg: colors.primary,
    fg: "#FFFFFF",
    border: colors.primary,
    borderW: 0,
    indicator: "#FFFFFF",
  },
  danger: {
    bg: colors.danger,
    fg: "#FFFFFF",
    border: colors.danger,
    borderW: 0,
    indicator: "#FFFFFF",
  },
  secondary: {
    bg: colors.surface,
    fg: colors.text,
    border: colors.border,
    borderW: 1,
    indicator: colors.primary,
  },
  outline: {
    bg: "transparent",
    fg: colors.primary,
    border: colors.primary,
    borderW: 2,
    indicator: colors.primary,
  },
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
});
