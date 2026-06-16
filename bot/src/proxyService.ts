import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from './whatsappClient';
import { tryHandlePaqueteriaFollowupReply } from './packageFollowupService'; 

// Inicializamos Supabase con la Service Role Key para poder saltar el RLS 
// y leer los teléfonos privados de los residentes sin exponerlos al cliente.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class ProxyService {
  /**
   * Iniciado por el guardia desde la App.
   */
  static async initiateContact(guardId: string, residentId: string, contextMessage: string) {
    // 1. Obtener el teléfono del residente de forma segura
    const { data: resident, error } = await supabase
      .from('residents')
      .select('phone_number, name, coto_id')
      .eq('id', residentId)
      .single();

    if (error || !resident?.phone_number) {
      throw new Error('Residente no encontrado o no tiene teléfono configurado.');
    }

    const cotoId = (resident as { coto_id?: string }).coto_id;
    if (!cotoId) {
      throw new Error('Residente sin coto_id; revisa datos y migración multi-tenant.');
    }

    // 2. Crear una "sesión de comunicación" temporal en la BD
    const { data: session, error: sessionError } = await supabase
      .from('proxy_sessions')
      .insert([{
        guard_id: guardId,
        resident_id: residentId,
        resident_phone: resident.phone_number,
        status: 'active',
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(), // Expira en 15 mins
        coto_id: cotoId,
      }])
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 3. Enviar el primer mensaje de WhatsApp al residente a través del Bot
    const msg = `Hola ${resident.name}, el guardia de tu coto informa: "${contextMessage}".\n\nResponde a este chat para hablar con él (tu número está protegido).`;
    await sendWhatsAppMessage(resident.phone_number, msg);

    return session;
  }

  /**
   * Iniciado por el Webhook cuando el residente responde al Bot de WhatsApp.
   */
  static async handleResidentReply(residentPhone: string, textReply: string) {
    const handledPackage = await tryHandlePaqueteriaFollowupReply(residentPhone, textReply);
    if (handledPackage) return;

    // 1. Buscar si hay una sesión activa para este teléfono
    const { data: activeSession } = await supabase
      .from('proxy_sessions')
      .select('*')
      .eq('resident_phone', residentPhone)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!activeSession) {
      // Podrías responderle al residente que no hay interacciones pendientes
      await sendWhatsAppMessage(residentPhone, 'No tienes ninguna solicitud de seguridad activa en este momento.');
      return;
    }

    // 2. Guardar el mensaje en el historial (opcional, para auditoría)
    await supabase.from('proxy_messages').insert([{
      session_id: activeSession.id,
      sender: 'resident',
      content: textReply
    }]);

    // 3. Reenviar el mensaje al guardia a la App.
    // Aquí puedes usar Supabase Realtime (el guardia está suscrito a la tabla 'proxy_messages')
    // o puedes enviarle una Notificación Push al guardia a través de Expo Push Notifications.
  }

  /**
   * Iniciado por la App del guardia para responder al residente.
   */
  static async handleGuardReply(sessionId: string, textMessage: string) {
    // 1. Obtener la sesión activa para saber a qué teléfono enviar el mensaje
    const { data: session, error } = await supabase
      .from('proxy_sessions')
      .select('resident_phone, status, expires_at')
      .eq('id', sessionId)
      .single();

    if (error || !session) throw new Error('Sesión de proxy no encontrada.');
    if (session.status !== 'active' || new Date(session.expires_at) < new Date()) {
      throw new Error('La sesión ha expirado o ya no está activa.');
    }

    // 2. Enviar el mensaje de WhatsApp al residente con un pequeño formato
    const formattedMessage = `👮‍♂️ *Guardia:* ${textMessage}`;
    await sendWhatsAppMessage(session.resident_phone, formattedMessage);
  }
}