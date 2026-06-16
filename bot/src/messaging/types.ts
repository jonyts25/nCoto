/**
 * Abstracción de envío de mensajes de texto para poder cambiar de whatsapp-web.js
 * a la API oficial de Meta (Cloud API) sin reescribir el dominio de negocio.
 */
export type MessagingProviderId = "whatsapp_web_js" | "meta_cloud_api";

export interface MessagingProvider {
  readonly id: MessagingProviderId;
  /** Número en formato internacional sin sufijos @c.us (se normaliza en cada implementación). */
  sendText(to: string, body: string): Promise<void>;
}
