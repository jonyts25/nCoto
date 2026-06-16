import type { Client } from "whatsapp-web.js";
import type { MessagingProvider } from "./types";

export function createWhatsAppWebJsProvider(client: Client): MessagingProvider {
  return {
    id: "whatsapp_web_js",
    async sendText(to: string, body: string) {
      const chatId = to.includes("@c.us") ? to : `${to}@c.us`;
      await client.sendMessage(chatId, body);
    },
  };
}
