import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from './whatsappClient';

function getServiceSupabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function waChatToDigits(from: string): string {
  return digitsOnly(from.split('@')[0] ?? '');
}

export async function findResidentByWhatsAppFrom(from: string): Promise<{ id: string; phone_number: string; name: string | null } | null> {
  const supabase = getServiceSupabase();
  const needle = waChatToDigits(from);
  if (!needle) return null;

  const { data: rows, error } = await supabase.from('residents').select('id, phone_number, name');
  if (error || !rows?.length) return null;

  for (const r of rows) {
    const d = digitsOnly(String(r.phone_number ?? ''));
    if (!d) continue;
    if (needle === d || needle.endsWith(d) || d.endsWith(needle)) {
      return { id: r.id as string, phone_number: String(r.phone_number), name: r.name as string | null };
    }
  }
  return null;
}

function interpretsAsYes(text: string): boolean {
  const x = text.trim().toLowerCase();
  return /^(s[ií]|si|sí|yes)\b/i.test(x) || x === 'sí' || x === 'si';
}

function interpretsAsNo(text: string): boolean {
  const x = text.trim().toLowerCase();
  return /^no\b/i.test(x) || x.includes('no lo recib') || x.includes('no lleg');
}

/**
 * Fin de día: paquetería activa sin ingreso confirmado por guardia → pregunta al inquilino por WhatsApp.
 */
export async function runPaqueteriaEndOfDayFollowup(): Promise<void> {
  const supabase = getServiceSupabase();
  const tz = process.env.PACKAGE_FOLLOWUP_TZ || 'America/Mexico_City';
  const { data: rows, error } = await supabase.rpc('paqueteria_followup_candidates', { p_tz: tz });
  if (error) {
    console.error('[paqueteria eod]', error);
    return;
  }
  const list = (rows ?? []) as Array<{
    visit_id: string;
    resident_id: string;
    guest_name: string;
    valid_day: string;
  }>;

  for (const row of list) {
    const { data: resident, error: re } = await supabase
      .from('residents')
      .select('phone_number, name')
      .eq('id', row.resident_id)
      .single();
    if (re || !resident?.phone_number) {
      console.warn('[paqueteria eod] sin teléfono residente', row.resident_id);
      continue;
    }

    const name = (resident.name as string) || 'vecino';
    const msg =
      `Hola ${name}, registramos un pase de *paquetería* pendiente de ingreso hoy ("${row.guest_name}"). ` +
      `¿Recibiste el paquete? Responde *SI* o *NO* a este mensaje.`;

    await sendWhatsAppMessage(String(resident.phone_number), msg);

    await supabase
      .from('visits')
      .update({ package_followup_sent_at: new Date().toISOString() })
      .eq('id', row.visit_id);

    const { data: visitRow } = await supabase
      .from('visits')
      .select('coto_id')
      .eq('id', row.visit_id)
      .single();

    const cotoId = visitRow?.coto_id as string | undefined;
    if (!cotoId) {
      console.warn('[paqueteria eod] visita sin coto_id', row.visit_id);
      continue;
    }

    await supabase.from('package_followup_prompts').insert([
      {
        visit_id: row.visit_id,
        resident_id: row.resident_id,
        coto_id: cotoId,
      },
    ]);
  }
}

/**
 * Respuestas SI/NO a la pregunta de paquetería. Devuelve true si el mensaje se consumió aquí.
 */
export async function tryHandlePaqueteriaFollowupReply(from: string, textReply: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const resident = await findResidentByWhatsAppFrom(from);
  if (!resident) return false;

  const { data: prompt, error } = await supabase
    .from('package_followup_prompts')
    .select('id, visit_id')
    .eq('resident_id', resident.id)
    .is('closed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !prompt) return false;

  const yes = interpretsAsYes(textReply);
  const no = interpretsAsNo(textReply);
  if (!yes && !no) {
    await sendWhatsAppMessage(
      resident.phone_number,
      'Por favor responde solo *SI* si recibiste el paquete, o *NO* si aún no lo tienes.'
    );
    return true;
  }

  if (yes) {
    await supabase
      .from('package_followup_prompts')
      .update({ closed_at: new Date().toISOString(), outcome: 'received' })
      .eq('id', prompt.id);
    await supabase
      .from('visits')
      .update({ tenant_package_received: true })
      .eq('id', prompt.visit_id);
    await sendWhatsAppMessage(resident.phone_number, 'Gracias. Marcamos que recibiste el paquete.');
    return true;
  }

  const { error: extErr } = await supabase.rpc('extend_paqueteria_visit_next_day', { visit_id: prompt.visit_id });
  if (extErr) {
    console.error('[paqueteria extend]', extErr);
    await sendWhatsAppMessage(
      resident.phone_number,
      'Hubo un error al extender el pase. Contacta a administración.'
    );
    return true;
  }

  await supabase
    .from('package_followup_prompts')
    .update({ closed_at: new Date().toISOString(), outcome: 'not_received' })
    .eq('id', prompt.id);
  await supabase
    .from('visits')
    .update({ tenant_package_received: false })
    .eq('id', prompt.visit_id);

  await sendWhatsAppMessage(
    resident.phone_number,
    'Entendido. Hemos extendido la vigencia del código QR de paquetería para mañana. Muestra el nuevo QR en caseta.'
  );
  return true;
}
