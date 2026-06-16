import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableOpacity 
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProxyMessages } from '@/src/features/visits/useProxyMessages';
import { supabase } from "@/src/lib/supabase";
import { ScreenHeader } from '@/src/components/ScreenHeader';

export default function ChatScreen() {
  // Obtenemos el sessionId de los parámetros de navegación
  const { sessionId, residentName } = useLocalSearchParams<{ sessionId: string, residentName?: string }>();
  const messages = useProxyMessages(sessionId || null);
  const [inputText, setInputText] = useState('');

  const sendMessage = async () => {
    if (!inputText.trim() || !sessionId) return;
    
    const textToSend = inputText.trim();
    // Limpiamos el input instantáneamente para mejor experiencia de usuario
    setInputText(''); 

    // 1. Guardamos el mensaje en Supabase
    const { error } = await supabase.from('proxy_messages').insert([{
      session_id: sessionId,
      sender: 'guard',
      content: textToSend
    }]);

    if (error) {
      console.error("Error enviando mensaje:", error);
      // Opcional: mostrar un Alert o regresar el texto al input en caso de fallo
    } else {
      // 2. AVISAR AL BOT DE WHATSAPP
      // Aquí deberás hacer un llamado HTTP a tu servidor Node.js (Bot) para que 
      // envíe este mensaje al WhatsApp del residente usando la sesión activa.
      /*
      await fetch('http://TU_BOT_URL/guard-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text: textToSend })
      });
      */
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isGuard = item.sender === 'guard';
    return (
      <View style={[styles.messageBubble, isGuard ? styles.messageGuard : styles.messageResident]}>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScreenHeader title="Chat" />
      {residentName ? <Text style={styles.subHeaderText}>Residente: {residentName}</Text> : null}

      <FlatList
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatContainer}
        // Invierte la lista visualmente si ordenas los mensajes más recientes primero
        // inverted={false} 
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  subHeaderText: { fontSize: 14, color: 'gray', textAlign: 'center', paddingVertical: 6, paddingHorizontal: 16 },
  chatContainer: { padding: 10, gap: 10 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 15 },
  messageGuard: { alignSelf: 'flex-end', backgroundColor: '#DCF8C6', borderBottomRightRadius: 0 },
  messageResident: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderBottomLeftRadius: 0, borderWidth: 1, borderColor: '#e0e0e0' },
  messageText: { fontSize: 16, color: '#333' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, minHeight: 40, maxHeight: 100, fontSize: 16 },
  sendButton: { marginLeft: 10, backgroundColor: '#007AFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 15 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});