import "dotenv/config";
import express from "express";
import cron from "node-cron";
import qrcode from "qrcode-terminal";
import webhookRouter from "./webhook";
import { runPaqueteriaEndOfDayFollowup } from "./packageFollowupService";
import { setWhatsAppWebClientForMessaging } from "./whatsappClient";

const useMeta = (process.env.MESSAGING_PROVIDER || "").toLowerCase() === "meta_cloud_api";

const app = express();
app.use(express.json());
app.use("/", webhookRouter);

const PORT = Number(process.env.PORT) || 3000;

if (process.env.PACKAGE_FOLLOWUP_TZ) {
  process.env.TZ = process.env.PACKAGE_FOLLOWUP_TZ;
}
const cronExpr = process.env.PACKAGE_FOLLOWUP_CRON || "59 23 * * *";

app.listen(PORT, () => {
  console.log(`Servidor Express escuchando en el puerto ${PORT}`);
  cron.schedule(cronExpr, () => {
    runPaqueteriaEndOfDayFollowup().catch((e) => console.error("[cron paqueteria]", e));
  });
  console.log(`[cron] paquetería EOD programado: "${cronExpr}" (TZ=${process.env.TZ || "default"})`);
});

if (useMeta) {
  setWhatsAppWebClientForMessaging(null);
  console.log(
    "[messaging] MESSAGING_PROVIDER=meta_cloud_api — salida vía Graph API. Entrada: configurar webhook en Meta → POST /webhooks/whatsapp (ver webhook.ts)."
  );
} else {
  void (async () => {
    const { client } = await import("./whatsappSession");
    const { ProxyService } = await import("./proxyService");
    setWhatsAppWebClientForMessaging(client);
    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log("Escanea el código QR con tu WhatsApp (Dispositivos vinculados) para iniciar el bot.");
    });
    client.on("ready", () => console.log("¡Cliente de WhatsApp listo y conectado!"));
    client.on("message", async (msg) => {
      await ProxyService.handleResidentReply(msg.from, msg.body);
    });
    client.initialize();
  })();
}
