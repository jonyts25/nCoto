import type { ReactNode } from "react";
import { Alert, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { colors } from "@/src/theme/colors";

type Props = {
  title: string;
  showBack?: boolean;
  /** Contenido a la derecha (p. ej. ícono de historial), antes del botón de salir. */
  right?: ReactNode;
  style?: ViewStyle;
  /** Muestra ícono de cerrar sesión (por defecto true; desactívalo si la pantalla ya tiene otro flujo de salida). */
  showSignOut?: boolean;
};

export function ScreenHeader({ title, showBack = true, right, style, showSignOut = true }: Props) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const confirmSignOut = () => {
    Alert.alert("Cerrar sesión", "¿Salir de la aplicación?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await supabase.auth.signOut();
            router.replace("/(auth)/login");
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.row, style]}>
      {showBack ? (
        <Pressable
          onPress={goBack}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Atrás"
          style={styles.side}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.rightSlot]}>
        {right}
        {showSignOut ? (
          <Pressable
            onPress={confirmSignOut}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            style={styles.signOutBtn}
          >
            <Ionicons name="log-out-outline" size={24} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 48,
    backgroundColor: colors.background,
  },
  side: { minWidth: 44, alignItems: "center", justifyContent: "center" },
  rightSlot: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingLeft: 4, gap: 4 },
  signOutBtn: { paddingHorizontal: 4 },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
});
