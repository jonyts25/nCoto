import React, { useState } from 'react';
import { Alert, StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { Link, useRouter } from 'expo-router';
import { colors } from '@/src/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Atención', 'Por favor ingresa tu correo y contraseña');
      return;
    }

    setLoading(true);
    
    // 1. Iniciamos sesión usando el cliente de Supabase
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert('Error al iniciar sesión', error.message);
      setLoading(false);
    } else {
      // 2. Si es exitoso, redirigimos al index. 
      // El index leerá la nueva sesión y nos enviará a la carpeta correcta según nuestro rol.
      router.replace('/');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>NCoto</Text>
      <Text style={styles.subtitle}>Control de Acceso Residencial</Text>

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
          placeholder="Tu contraseña"
          autoCapitalize="none"
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Iniciar Sesión</Text>
        )}
      </TouchableOpacity>

      <Link href="/(auth)/register" asChild>
        <Pressable style={styles.linkWrap}>
          <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', color: colors.success, marginBottom: 5 },
  subtitle: { fontSize: 16, textAlign: 'center', color: colors.textMuted, marginBottom: 40 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, color: colors.text, marginBottom: 5, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: colors.border, padding: 15, borderRadius: 8, fontSize: 16, backgroundColor: colors.surface },
  button: { backgroundColor: colors.success, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  linkWrap: { marginTop: 20, alignItems: 'center' },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
});