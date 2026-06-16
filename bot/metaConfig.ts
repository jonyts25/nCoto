/**
 * Configuración central para WhatsApp Cloud API (Meta).
 * Sustituir whatsapp-web.js por el webhook oficial: bot/src/webhook.ts
 *
 * Variables de entorno (no commitear valores reales):
 * - META_WHATSAPP_ACCESS_TOKEN — token de acceso del sistema / WABA (Graph API).
 * - META_WHATSAPP_PHONE_NUMBER_ID — ID del número de WhatsApp Business (dashboard Meta).
 *
 * Compatibilidad temporal con nombres ya usados en el repo:
 * - WHATSAPP_CLOUD_TOKEN
 * - WHATSAPP_CLOUD_PHONE_NUMBER_ID
 */

/** Nombres de variables de entorno para ACCESS_TOKEN y PHONE_NUMBER_ID (Meta). */
export const META_ENV_KEYS = {
  accessToken: "META_WHATSAPP_ACCESS_TOKEN",
  phoneNumberId: "META_WHATSAPP_PHONE_NUMBER_ID",
} as const;

/** Placeholders de documentación / plantillas (.env.example). No usar en producción. */
export const META_PLACEHOLDERS = {
  accessToken: "<META_WABA_ACCESS_TOKEN>",
  phoneNumberId: "<META_PHONE_NUMBER_ID>",
} as const;

const LEGACY_ENV = {
  accessToken: "WHATSAPP_CLOUD_TOKEN",
  phoneNumberId: "WHATSAPP_CLOUD_PHONE_NUMBER_ID",
} as const;

/**
 * Credenciales resueltas para llamadas a graph.facebook.com (envío y, más adelante, webhook).
 */
export function getMetaCloudCredentials(): {
  accessToken: string;
  phoneNumberId: string;
  isConfigured: boolean;
} {
  const accessToken =
    process.env[META_ENV_KEYS.accessToken]?.trim() ||
    process.env[LEGACY_ENV.accessToken]?.trim() ||
    "";
  const phoneNumberId =
    process.env[META_ENV_KEYS.phoneNumberId]?.trim() ||
    process.env[LEGACY_ENV.phoneNumberId]?.trim() ||
    "";
  return {
    accessToken,
    phoneNumberId,
    isConfigured: Boolean(accessToken && phoneNumberId),
  };
}
