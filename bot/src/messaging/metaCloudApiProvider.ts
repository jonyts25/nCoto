import type { MessagingProvider } from "./types";
import { getMetaCloudCredentials, META_ENV_KEYS, META_PLACEHOLDERS } from "../../metaConfig";

/**
 * WhatsApp Cloud API (Graph API v18+).
 * Credenciales: {@link getMetaCloudCredentials} / bot/metaConfig.ts (META_WHATSAPP_* o WHATSAPP_CLOUD_*).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export function createMetaCloudApiProvider(): MessagingProvider {
  const { accessToken: token, phoneNumberId, isConfigured } = getMetaCloudCredentials();
  const version = process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0";

  if (!isConfigured) {
    throw new Error(
      `Meta Cloud API: define ${META_ENV_KEYS.accessToken} y ${META_ENV_KEYS.phoneNumberId} (o legado WHATSAPP_*). Placeholders: ${META_PLACEHOLDERS.accessToken}, ${META_PLACEHOLDERS.phoneNumberId}.`
    );
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  return {
    id: "meta_cloud_api",
    async sendText(to: string, body: string) {
      const digits = to.replace(/\D/g, "");
      if (!digits) throw new Error("Meta Cloud API: destino vacío");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: digits,
          type: "text",
          text: { body },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Meta Cloud API ${res.status}: ${errText}`);
      }
    },
  };
}
