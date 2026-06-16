import { getMessagingProvider } from "./messaging/getMessagingProvider";
import type { Client } from "whatsapp-web.js";

let cachedClient: Client | null = null;

export function setWhatsAppWebClientForMessaging(client: Client | null) {
  cachedClient = client;
}

export const sendWhatsAppMessage = async (phone: string, message: string) => {
  const provider = getMessagingProvider(cachedClient);
  await provider.sendText(phone, message);
};
