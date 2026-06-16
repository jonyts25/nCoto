# NCoto

Control de acceso digital para fraccionamientos (cotos): pases QR, caseta web/móvil, morosidad en tiempo real.

**Documentación de producto:** `NCOTO_MVP_SCOPE.md`, `NCOTO_DEMO_SETUP_AND_SCRIPT.md`

---

## Estructura del monorepo

| Carpeta | Qué es |
|---------|--------|
| `mobile/` | App Expo (residente, guardia, admin) |
| `web/` | Next.js — caseta `/guardia/scan`, admin `/admin/dashboard` |
| `bot/` | Node.js — WhatsApp proxy y cron paquetería (opcional) |
| `supabase/` | Migraciones SQL, Edge Functions |

---

## Clonar en otra laptop (setup rápido)

### 1. Clonar

```bash
git clone https://github.com/jonyts25/nCoto.git
cd nCoto
```

### 2. Variables de entorno (secretos locales)

Los secretos **no van en Git**. Tras clonar, crea tus archivos locales:

**Windows (PowerShell):**

```powershell
.\scripts\setup-env.ps1
```

**Mac / Linux:**

```bash
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

Eso copia:

| Plantilla | Archivo local (gitignored) |
|-----------|----------------------------|
| `mobile/.env.example` | `mobile/.env` |
| `web/.env.example` | `web/.env.local` |
| `bot/.env.example` | `bot/.env` |

**Lista completa de variables:** ver `env.template` en la raíz.

### 3. Dónde obtener las claves

1. Entra a [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto.
2. **Project Settings → API**
3. Copia:

| Valor en Dashboard | Dónde pegarlo |
|--------------------|---------------|
| **Project URL** | `EXPO_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` (bot) |
| **anon public** | `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role** | Solo `bot/.env` → `SUPABASE_SERVICE_ROLE_KEY` |

Usa el **mismo proyecto** en mobile, web y bot.

> **Nunca** pongas `service_role` en mobile ni web: quedaría expuesta en el bundle del cliente.

### 4. Instalar dependencias

```bash
cd mobile && npm install && cd ..
cd web && npm install && cd ..
cd bot && npm install && cd ..
```

### 5. Arrancar en desarrollo

**Mobile (Expo):**

```bash
cd mobile
npx expo start
```

**Web (caseta / admin):**

```bash
cd web
npm run dev
```

- Caseta: http://localhost:3000/guardia/scan  
- Admin morosidad: http://localhost:3000/admin/dashboard  

**Bot (opcional — WhatsApp):**

```bash
cd bot
npm run dev
```

Requiere `bot/.env` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La sesión WhatsApp Web se guarda en `bot/.wwebjs_auth/` (gitignored).

---

## Supabase (proyecto remoto)

Las migraciones ya están en `supabase/migrations/`. En la laptop nueva:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase migration list    # verificar que local = remoto
```

**Edge Function desplegada en producción:** `admin-create-user`  
**Opcional (push):** `push-notifications` — ver migración `20260516120000_expo_push_notifications_triggers.sql`

---

## Checklist post-clone

- [ ] `mobile/.env` con URL + anon key
- [ ] `web/.env.local` con los **mismos** URL + anon key
- [ ] `bot/.env` solo si usas bot (URL + service role)
- [ ] `npm install` en mobile, web, (bot)
- [ ] Login de prueba funciona en Expo
- [ ] `/guardia/scan` carga en web

**Demo y usuarios seed:** `NCOTO_DEMO_SETUP_AND_SCRIPT.md`

---

## Qué NO se sube a Git (ya en `.gitignore`)

- `**/.env`, `**/.env.local`
- `bot/.wwebjs_auth/` (sesión WhatsApp)
- `node_modules/`, `.expo/`, `.next/`

---

## Remotes Git

| Remote | URL |
|--------|-----|
| `nCoto` | https://github.com/jonyts25/nCoto.git |
| `origin` | Repo histórico cocheragamers/NCotoProject (si aplica) |

Rama principal en GitHub: **`main`**
