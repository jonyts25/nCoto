import { useEffect, useState } from 'react';
// IMPORTANTE: Ajusta esta ruta hacia donde tengas exportado tu cliente de Supabase en React Native
import { supabase } from "@/src/lib/supabase";

export type ProxyMessage = {
  id: string;
  session_id: string;
  sender: 'guard' | 'resident';
  content: string;
  created_at: string;
};

export function useProxyMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ProxyMessage[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    // 1. Cargar el historial de mensajes de esta sesión temporal
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('proxy_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as ProxyMessage[]);
      }
    };

    fetchMessages();

    // 2. Suscribirnos a nuevos mensajes en tiempo real
    const channel = supabase
      .channel(`proxy_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proxy_messages',
          filter: `session_id=eq.${sessionId}`, // Solo escuchamos mensajes de esta sesión
        },
        (payload) => {
          const newMessage = payload.new as ProxyMessage;
          setMessages((currentMessages) => [...currentMessages, newMessage]);
        }
      )
      .subscribe();

    // 3. Limpiar la suscripción cuando el guardia cierra la pantalla del chat
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return messages;
}