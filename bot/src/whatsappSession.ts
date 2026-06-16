import { Client, LocalAuth } from 'whatsapp-web.js';

export const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});
