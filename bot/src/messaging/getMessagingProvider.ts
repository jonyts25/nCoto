import type { MessagingProvider } from "./types";
import { createWhatsAppWebJsProvider } from "./whatsappWebJsProvider";
import { createMetaCloudApiProvider } from "./metaCloudApiProvider";
import type { Client } from "whatsapp-web.js";

/**
 * MESSAGING_PROVIDER=meta_cloud_api → API oficial Meta (sin sesión web).
 * Cualquier otro valor o ausencia → whatsapp-web.js (desarrollo / legado).
 */
export function getMessagingProvider(wwebClient: Client | null): MessagingProvider {
  const mode = (process.env.MESSAGING_PROVIDER || "whatsapp_web_js").toLowerCase();
  if (mode === "meta_cloud_api") {
    return createMetaCloudApiProvider();
  }
  if (!wwebClient) {
    throw new Error("MESSAGING_PROVIDER=whatsapp_web_js requiere cliente whatsapp-web.js inicializado.");
  }
  return createWhatsAppWebJsProvider(wwebClient);
}
