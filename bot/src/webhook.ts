import { Router } from 'express';
import { ProxyService } from './proxyService';
import { runPaqueteriaEndOfDayFollowup } from './packageFollowupService';

const router = Router();

/**
 * Verificación de webhook Meta (WhatsApp Cloud API).
 * Configura en Meta: GET URL con VERIFY_TOKEN igual a META_WHATSAPP_VERIFY_TOKEN.
 */
router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verify = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && verify && token === verify && typeof challenge === 'string') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * Entrada de mensajes Meta Cloud API (esqueleto). Mapea el payload a handleResidentReply cuando lo implementes.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
router.post('/webhooks/whatsapp', async (req, res) => {
  try {
    if (process.env.MESSAGING_PROVIDER !== 'meta_cloud_api') {
      return res.status(404).json({ ok: false, error: 'Solo activo con MESSAGING_PROVIDER=meta_cloud_api' });
    }
    // TODO: extraer from / text del body de Meta y llamar ProxyService.handleResidentReply
    console.log('[meta webhook] payload recibido (implementar parser)');
    return res.sendStatus(200);
  } catch (e: any) {
    console.error('[meta webhook]', e);
    return res.status(500).json({ ok: false });
  }
});

// Endpoint para que la App del Guardia solicite hablar con el residente
router.post('/request-contact', async (req, res) => {
  try {
    const { guardId, residentId, message } = req.body;
    
    const session = await ProxyService.initiateContact(guardId, residentId, message);
    
    res.status(200).json({ success: true, sessionId: session.id });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para que la App del Guardia responda al residente
/** Ejecuta manualmente el cierre de día de paquetería (misma lógica que el cron). Proteger en producción. */
router.post('/jobs/paqueteria-followup', async (req, res) => {
  try {
    const secret = process.env.CRON_HTTP_SECRET;
    if (secret) {
      const h = req.headers['x-cron-secret'];
      if (h !== secret) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }
    }
    await runPaqueteriaEndOfDayFollowup();
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/guard-reply', async (req, res) => {
  try {
    const { sessionId, text } = req.body;
    
    if (!sessionId || !text) {
      return res.status(400).json({ success: false, error: 'Faltan parámetros (sessionId, text)' });
    }

    await ProxyService.handleGuardReply(sessionId, text);
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;