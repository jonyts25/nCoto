import { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { useRouter, Link } from "expo-router";
import { colors } from "@/src/theme/colors";

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signUpWithEmail() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      Alert.alert("Atención", "Ingresa correo y contraseña.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Atención", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Atención", "Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert("Error al registrarse", error.message);
      return;
    }

    if (data.session) {
      router.replace("/(auth)/onboarding");
      return;
    }

    Alert.alert(
      "Revisa tu correo",
      "Si tu proyecto requiere confirmación por email, abre el enlace y luego inicia sesión.",
      [{ text: "Ir a login", onPress: () => router.replace("/(auth)/login") }],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <Text style={styles.title}>Crear cuenta</Text>
      <Text style={styles.subtitle}>Regístrate para solicitar acceso a tu coto</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          onChangeText={setEmail}
          value={email}
          placeholder="email@ejemplo.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          placeholder="Mínimo 6 caracteres"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Confirmar contraseña</Text>
        <TextInput
          style={styles.input}
          onChangeText={setConfirm}
          value={confirm}
          secureTextEntry
          placeholder="Repite tu contraseña"
          autoCapitalize="none"
        />
      </View>

      <Pressable style={styles.button} onPress={() => void signUpWithEmail()} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Registrarme</Text>
        )}
      </Pressable>

      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.linkWrap}>
          <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center", color: colors.primary, marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", color: colors.textMuted, marginBottom: 32 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.success,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkWrap: { marginTop: 20, alignItems: "center" },
  linkText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
});
