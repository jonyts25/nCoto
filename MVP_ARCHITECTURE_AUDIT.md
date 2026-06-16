# Diagnóstico arquitectónico NCoto — cierre MVP

Documento generado por auditoría estática del repositorio (código + migraciones; no se ejecutó la app ni Supabase remoto). Los documentos `PROJECT_STATUS.md`, `PRODUCT_STATUS_MVP.md` y `MVP_STATUS.md` están **parcialmente desactualizados** respecto al código actual (morosidad admin, pagos, directorio, push, guardia móvil con mora).

**Regla de lectura:** priorizar el código en `mobile/`, `web/`, `bot/` y `supabase/migrations/` sobre documentación interna antigua.

---

## 1. Resumen ejecutivo

### Qué tipo de app es

**Plataforma de gestión residencial multi-tenant (*cotos*)**: pases de visita con QR, caseta (móvil + web), morosidad por unidad, alta/aprobación de vecinos, comprobantes de pago, avisos, tesorería para mesa directiva, proxy WhatsApp residente↔guardia, y jobs de seguimiento de paquetería.

### Stack

| Capa | Tecnología |
|------|------------|
| Datos / auth | **Supabase** (Postgres, RLS, Auth, Storage, Realtime, Edge Functions, `pg_net`) |
| Móvil | **Expo 54** + **React Native** + **Expo Router** + `@supabase/supabase-js` + Zod |
| Web producto | **Next.js 16** (caseta, admin morosidad, tesorería mesa) |
| Bot | **Node/Express** + `whatsapp-web.js` o **Meta Cloud API** + cron paquetería |
| Tests | **Vitest** solo en `mobile/src/features/visits/__tests__/` (2 archivos) |

### Arquitectura detectada

- **Monorepo** sin paquete shared: `mobile/`, `web/`, `bot/`, `supabase/`.
- **Backend-as-a-service**: sin API REST propia de negocio; el cliente habla con PostgREST + RPCs `SECURITY DEFINER`.
- **Multi-tenancy** vía `profiles.coto_id`, `current_user_coto_id()` y `active_coto_id` para superadmin (`admin`).
- **Capa de datos en cliente**: repos en `mobile/src/features/*` y `web/lib/*`; estado de sesión con `useAuth` + `CotoScopeContext`.
- **Validación de QR/visitas duplicada** entre `mobile/src/features/visits/` y `web/lib/visits/`.

### Qué tan cerca está del MVP

**~70–80% del núcleo “visitas + caseta + morosidad + admin básico”** si en Supabase remoto están aplicadas **todas** las migraciones de `supabase/migrations/` y desplegadas las Edge Functions.

**Bloqueadores típicos de demo real:** migraciones no aplicadas, Edge Functions sin deploy, bucket `payment-proofs`, config push (`ncoto_internal.push_edge_config`), bot sin sesión WhatsApp, variables de entorno mal configuradas.

---

## 2. Estado actual de implementación

| Módulo / feature | Archivos principales | Estado | Evidencia | Riesgo / comentario |
|------------------|----------------------|--------|-----------|---------------------|
| **Auth email/contraseña** | `mobile/app/(auth)/login.tsx`, `mobile/src/lib/supabase.ts` | Implementado | `signInWithPassword`, sesión en AsyncStorage | Sin MFA; depende de confirmación email en proyecto Supabase |
| **Registro self-service** | `mobile/app/(auth)/register.tsx` | Implementado | `signUp` → onboarding o login | Trigger crea perfil en coto por defecto (`00000000-0000-4000-8000-000000000001`) |
| **Onboarding residente** | `mobile/app/(auth)/onboarding.tsx`, `onboardingRepo.ts` | Implementado | Nombre, teléfono, casa, owner/tenant | Requiere migraciones `approval_status`, `claimed_house_number` |
| **Cola de aprobación** | `mobile/app/(auth)/waiting.tsx`, `directory.tsx` | Implementado | `residentIsAwaitingApproval`, admin aprueba/rechaza | Sin aprobación no entra a `(resident)` |
| **Roles RBAC en BD** | `supabase/migrations/20260418120000_rbac_user_role_enum.sql`, `useAuth.ts` | Implementado | `profiles.role` enum: resident, guard, admin, coto_admin, board_member | Ya no se infiere rol por email (docs viejos incorrectos) |
| **Routing por rol** | `mobile/app/index.tsx` | Parcial | admin/coto_admin→admin, guard→security, resto→resident | **`board_member` cae en resident** (intencional vía `(board)/_layout` redirect) |
| **Superadmin multi-coto** | `SuperCotoSelector.tsx`, `CotoScopeContext.tsx`, migración `20260419120000_*` | Implementado | `active_coto_id` + `current_user_coto_id()` | Guardia usa `coto_id` físico, no activo (correcto en SQL) |
| **Visitas + QR** | `visits.tsx`, `repo.ts`, `qr.ts`, `validation.ts` | Implementado | Tipos eventual/frecuente/servicio/paquetería, QR v2 Base64+Zod | Listas proveedor fijas en código, no catálogo admin |
| **Morosidad datos** | `20260420120000_*`, `delinquency/repo.ts` | Implementado | `properties.is_delinquent`, RLS insert visits | Realtime requiere `20260422140000_realtime_properties.sql` |
| **Morosidad UI residente** | `(resident)/index.tsx`, `visits.tsx` | Implementado | Banner, deshabilitar generar, redirect Visitas | Emergencia **no** bloqueada por mora |
| **Morosidad UI admin** | `(admin)/index.tsx`, `propertiesRepo` | Implementado | Toggle por casa + Realtime | Corrige doc que decía “solo DB” |
| **Caseta web** | `web/app/guardia/scan/page.tsx`, `GuardScanClient.tsx` | Implementado | HID, lista hoy, mora, placas, `mark_visit_used` | Requiere `NEXT_PUBLIC_*` y usuario `guard` logueado |
| **Caseta móvil** | `(security)/index.tsx`, `[id].tsx` | Implementado | Cámara QR + `peekVisitResidentIsDelinquent` antes de confirmar | Paridad con web restaurada en código actual |
| **Bitácora guardia** | `(security)/logs.tsx` | Implementado | `listVisitsScoped` vía RLS guard | No es “previstas hoy” como web |
| **Chat proxy guardia** | `(security)/chat.tsx`, `useProxyMessages.ts`, `bot/proxyService.ts` | Parcial | Insert en `proxy_messages`; fetch al bot **comentado** | Mensajes no llegan a WhatsApp sin URL del bot |
| **Directorio admin** | `(admin)/directory.tsx`, `directoryRepo.ts` | Implementado | Pendientes / activos, approve/reject | Pantalla completa (~343 líneas), no placeholder |
| **Alta usuarios** | `UsersManagementScreen.tsx`, `admin-create-user/index.ts` | Implementado / Dudoso en prod | `supabase.functions.invoke("admin-create-user")` | **404 si función no desplegada** |
| **Comprobantes de pago** | `(resident)/payments.tsx`, `(admin)/pending_payments.tsx`, migración `20260515120000_*` | Implementado | Storage bucket + RLS + aprobar/rechazar | Residente necesita `property_id`; bucket debe existir en Supabase |
| **Tesorería mesa** | `(resident)/treasury.tsx`, `board/treasuryRepo.ts`, `web/app/mesa/tesoreria/` | Implementado | Tab solo `board_member`; ingresos al aprobar pago (trigger en migración) | `board_member` entra por shell residente |
| **Avisos / alertas** | `(admin)/announcements.tsx`, `announcementsRepo.ts` | Implementado | Tab “Alertas”; insert con audiencia | `coto_admin` limitado por RLS (`20260522120000_*`) |
| **Push notifications** | `PushTokenRegistrar.tsx`, `push-notifications/index.ts`, migración triggers | Parcial | Cliente registra token; triggers llaman Edge Function | Requiere deploy función + fila en `ncoto_internal.push_edge_config` + secret |
| **Emergencia** | `EmergencyConfirmControl.tsx`, `(resident)/index.tsx` | No implementado (backend) | Solo `Alert.alert` “Pronto conectaremos…” | No hay RPC/tabla/notificación a caseta |
| **Entregas (`deliveries`)** | Tabla en schema archive | No implementado (UI) | Sin referencias en `mobile/` | Solo BD |
| **Bot WhatsApp** | `bot/src/index.ts`, `webhook.ts`, `packageFollowupService.ts` | Parcial | Proxy + cron paquetería; Meta opcional | Sin morosidad en bot; sesión `.wwebjs_auth` no versionable |
| **Web landing** | `web/app/page.tsx` | No implementado (producto) | Plantilla Next por defecto | Sin portal ni links a `/guardia/scan` |
| **Legacy `(tabs)`** | `mobile/app/(tabs)/` | Dudoso / huérfano | Template Expo con `scan` inexistente | Declarado en `_layout` raíz pero no en flujo principal |
| **Tests / CI** | `vitest`, sin `.github/` | Parcial / No | 2 tests unitarios visitas | Sin E2E ni pipeline |

---

## 3. Flujos que ya se pueden probar

### 3.1 Login

| | |
|--|--|
| **Pasos** | App móvil → login con email/contraseña existente en Supabase Auth. |
| **Datos** | Usuario con fila en `profiles` (`role`, `coto_id`). |
| **Esperado** | `app/index.tsx` redirige según rol; estados `missing_profile` / `missing_email` muestran pantalla de bloqueo. |
| **Puede fallar** | Sin `.env` en `mobile/` (`EXPO_PUBLIC_SUPABASE_*` vacíos → cliente roto). Perfil ausente. |

### 3.2 Registro + onboarding + aprobación

| | |
|--|--|
| **Pasos** | Register → onboarding (casa, teléfono) → waiting → admin en **Residentes** aprueba. |
| **Datos** | Coto default existe; casa debe poder vincularse a `properties` al aprobar. |
| **Esperado** | Tras approve, residente entra a tabs Inicio/Visitas/Pagos. |
| **Puede fallar** | Migraciones de `approval_status` no aplicadas. Casa inexistente en `properties`. |

### 3.3 Residente: crear visita y QR

| | |
|--|--|
| **Pasos** | Login residente aprobado → Visitas → tipo + datos → guardar → detalle con QR. |
| **Datos** | No moroso (`is_delinquent=false`); RLS insert OK. |
| **Esperado** | Fila en `visits`; QR decodificable (`qr.ts`). |
| **Puede fallar** | Moroso: RLS bloquea insert. Columnas `visit_type`, `valid_day` faltantes si migración vieja. |

### 3.4 Caseta web: escaneo e ingreso

| | |
|--|--|
| **Pasos** | `web` con `.env.local` → `/guardia/scan` → login guard → escanear QR (lector HID) o “Simular escaneo” desde lista del día → confirmar. |
| **Datos** | Usuario `guard`, visita `active`, ventana válida (`canValidateVisitNow`). |
| **Esperado** | Si moroso: modal bloqueante. Si OK: `mark_visit_used`, estado actualizado. |
| **Puede fallar** | Variables Next no configuradas. Rol distinto de guard. RPC no desplegada. |

### 3.5 Caseta móvil: escaneo e ingreso

| | |
|--|--|
| **Pasos** | Login guard → tab escanear → QR → pantalla `[id]` → confirmar. |
| **Datos** | Mismos que web. |
| **Esperado** | Chequeo mora vía `peekVisitResidentIsDelinquent` en `[id].tsx` antes de `markVisitUsed`. |
| **Puede fallar** | Permisos cámara. Error RPC → mensaje en UI. |

### 3.6 Admin: morosidad y pagos

| | |
|--|--|
| **Pasos** | admin/coto_admin → Panel (toggles mora) → Pagos (aprobar comprobante con imagen). |
| **Datos** | `properties` del coto; submissions `pending` en Storage. |
| **Esperado** | Toggle `is_delinquent`; residente ve cambio por Realtime; pago aprobado genera ingreso en `coto_finances` (si trigger aplicado). |
| **Puede fallar** | Bucket `payment-proofs` o políticas Storage. Superadmin sin `active_coto_id` seleccionado. |

### 3.7 Alta de usuarios (admin)

| | |
|--|--|
| **Pasos** | Admin → Usuarios → crear vía formulario. |
| **Datos** | Edge Function desplegada; caller con permisos según rol. |
| **Esperado** | Nuevo auth user + `profiles` actualizado. |
| **Puede fallar** | 404 función. `coto_admin` creando fuera de su coto. |

### 3.8 Mesa directiva (board_member)

| | |
|--|--|
| **Pasos** | Usuario con rol `board_member` → entra como residente → tab **Tesorería**. |
| **Datos** | Políticas RLS `coto_finances`. |
| **Esperado** | Ver/registrar egresos manuales (según `treasury.tsx`). |
| **Puede fallar** | Enum `board_member` no en BD remota. |

### 3.9 Bot / WhatsApp (integración externa)

| | |
|--|--|
| **Pasos** | `bot/.env` con service role → `npm run dev` → escanear QR o Meta webhook. |
| **Datos** | Tablas `proxy_sessions`, `residents` con teléfonos. |
| **Esperado** | Cron paquetería EOD; proxy si flujo completo configurado. |
| **Puede fallar** | Chat móvil no llama al bot (código comentado). Sin morosidad en mensajes bot. |

### 3.10 Navegación principal por rol

| Rol | Destino |
|-----|---------|
| `admin`, `coto_admin` | `/(admin)` — Panel, Residentes, Usuarios, Alertas, Pagos |
| `guard` | `/(security)` — Escanear, Bitácora |
| `resident`, `board_member` | `/(resident)` — (+ Tesorería si board) |
| Sin sesión | `/(auth)/login` |

---

## 4. Pendientes para cerrar MVP

### Críticos (bloquean probar o lanzar)

1. **Aplicar migraciones** `supabase/migrations/*.sql` en el proyecto Supabase remoto (orden por timestamp).
2. **Desplegar Edge Functions** `admin-create-user` y `push-notifications`.
3. **Configurar entornos** sin secretos en repo: corregir `mobile/.env.example` (contiene valor tipo `sb_secret_...`, inaceptable como plantilla).
4. **Bucket Storage** `payment-proofs` + políticas (migración `20260515120000_*`).
5. **Coto seed** `00000000-0000-4000-8000-000000000001` para registros nuevos (trigger `handle_new_user_profile`).
6. **Usuarios de prueba** por rol con `profiles` completos (`property_id` para residentes de demo de pagos/mora).

### Importantes (antes de demo)

1. **Emergencia**: hoy solo UI (`onEmergencyConfirmed` en `(resident)/index.tsx`).
2. **Conectar chat guardia → bot** (`chat.tsx` líneas comentadas con `guard-reply`).
3. **Push end-to-end**: `ncoto_internal.push_edge_config` + `PUSH_NOTIFICATIONS_WEBHOOK_SECRET` + EAS `projectId` para builds reales.
4. **Web**: reemplazar `web/app/page.tsx` con índice a `/guardia/scan`, `/admin/dashboard`, `/mesa/tesoreria`.
5. **Documentar runbook** de arranque (mobile, web, bot) — no hay README raíz.
6. **Verificar paridad** lista “visitas hoy” en app guardia (opcional para demo si usan web en caseta).

### Mejoras (pueden esperar)

- Catálogo editable de proveedores paquetería/servicio.
- UI `deliveries`.
- Degradar WhatsApp si unidad morosa.
- Partner Admin multi-coto.
- E2E automatizado, CI.
- Limpiar `(tabs)` legacy y `.wwebjs_auth` del árbol git.

---

## 5. Auditoría técnica

| Área | Evaluación |
|------|------------|
| **Arquitectura general** | Sólida para MVP BaaS: RLS como frontera de seguridad. Debilidad: lógica duplicada mobile/web y dependencia fuerte de “migraciones aplicadas = verdad”. |
| **Separación de responsabilidades** | Repos por feature razonables; pantallas admin grandes (`directory.tsx`, `pending_payments.tsx`) mezclan UI + orquestación. |
| **Manejo de errores** | Alertas en UI; `useAuth` hace fallback si columnas faltan. Pocos errores centralizados. |
| **Seguridad** | RLS + RPC con chequeo de rol guard. **Riesgo:** `.env.example` con credencial sensible. CORS `*` en Edge Functions. Service role solo en bot/Edge (correcto). |
| **Validaciones** | Zod en QR; validación temporal en TS (`validation.ts`) — debe coincidir con reglas de negocio en RPC si se endurece servidor. |
| **AuthZ** | Basada en `profiles.role` y `current_user_coto_id()`; triggers limitan cambio de roles. |
| **Variables de entorno** | Mobile: `EXPO_PUBLIC_*`. Web: `NEXT_PUBLIC_*`. Bot: `SUPABASE_*`, `MESSAGING_PROVIDER`, cron. Sin validación en arranque si URL/key vacíos (cliente silencioso). |
| **Supabase** | Fuente de verdad en migraciones + `archive/` (schema histórico). **Inconsistencia:** docs dicen `esquema_ncoto.sql` vacío; verdad está en `supabase/migrations/` + archive. |
| **Performance** | Aceptable para MVP; Realtime en properties/admin puede multiplicar suscripciones. Listados sin paginación visible. |
| **Duplicación** | `validation.ts` / repos en mobile y web. |
| **Componentes grandes** | Admin screens 300+ líneas. |
| **Lógica de negocio** | Parte crítica bien en Postgres (mora, mark_visit_used); parte en cliente (ventanas horarias). |
| **Escalabilidad** | Bot WhatsApp Web no escala horizontalmente; Meta API es el camino documentado en `bot/`. |

---

## 6. Revisión base de datos / backend

### Tablas / objetos principales (deducidos de migraciones + archive)

| Dominio | Tablas / objetos |
|---------|------------------|
| Tenancy | `cotos`, `profiles` (`coto_id`, `active_coto_id`, `property_id`, `approval_status`, `occupancy_kind`, `expo_push_token`) |
| Unidades | `properties` (`is_delinquent`, `house_number`) |
| Accesos | `visits`, `visit_access_log`, `package_followup_prompts` |
| Comunicación | `proxy_sessions`, `proxy_messages`, `residents` (teléfonos para bot) |
| Finanzas | `payment_submissions`, `coto_finances` |
| Comunicados | `announcements` |
| Ops | `deliveries`, `logs` (legacy) |
| Push interno | `ncoto_internal.push_edge_config` |

### RPCs / funciones clave

- `mark_visit_used`, `peek_visit_exists_for_security`, `peek_visit_resident_is_delinquent`
- `current_user_coto_id()`, `current_user_property_is_delinquent()`
- `extend_paqueteria_visit_next_day`, `paqueteria_followup_candidates`
- Triggers: push en avisos y cambio estado de pago; ingreso automático al aprobar comprobante

### RLS y permisos

- Visitas: residente propias; guard lee tenant; insert bloqueado si moroso.
- Pagos: residente inserta solo su `property_id`; admin del coto efectivo aprueba.
- Guardia peek usa **`coto_id` físico** del guardia, no `active_coto_id` del superadmin.

### Inconsistencias frontend ↔ backend

| Tema | Detalle |
|------|---------|
| Emergencia | UI sin persistencia; BD sin evento. |
| Chat | BD sí; enlace bot comentado en app. |
| Push | Cliente escribe token; envío depende de config SQL + Edge no visible en cliente. |
| Nuevos residentes | Dos migraciones tocando `handle_new_user_profile` (pending vs approved) — **gana la más reciente** (`20260524120000` → pending); validar en remoto. |
| Documentación interna | `PRODUCT_STATUS_MVP.md` dice mora no en admin móvil y avisos rotos — **código actual los tiene**. |

### Edge Functions

| Función | Uso |
|---------|-----|
| `admin-create-user` | Alta usuarios desde `createUserViaEdgeFunction` |
| `push-notifications` | Llamada desde triggers vía `pg_net` |

### Migraciones en repo (`supabase/migrations/`)

1. `20260418120000_rbac_user_role_enum.sql`
2. `20260419120000_superadmin_coto_scope_and_coto_admin.sql`
3. `20260420120000_properties_backfill_and_delinquency_rls.sql`
4. `20260421100000_peek_visit_resident_delinquent.sql`
5. `20260422120000_cotos_banner_image_url.sql`
6. `20260422140000_realtime_properties.sql`
7. `20260515120000_payment_submissions_and_storage.sql`
8. `20260516095500_user_role_add_board_member_enum.sql`
9. `20260516100000_board_member_finances_announcements.sql`
10. `20260516120000_expo_push_notifications_triggers.sql`
11. `20260522120000_announcements_insert_coto_admin.sql`
12. `20260523120000_profile_directory_approval.sql`
13. `20260524120000_profile_onboarding_fields.sql`

---

## 7. Plan de acción para cerrar MVP (checklist priorizado)

| # | Tarea | Archivo / área | Qué corregir | Por qué | Cómo validar |
|---|--------|----------------|--------------|---------|--------------|
| 1 | Aplicar migraciones | `supabase/migrations/` | Ejecutar todas en remoto | Sin DDL, app falla por columnas/RPC | Supabase SQL: existe `payment_submissions`, columnas en `profiles` |
| 2 | Seed coto + propiedades | SQL manual o script | Coto default + casas de prueba | Registro/onboarding exige coto | Nuevo registro no lanza excepción trigger |
| 3 | Deploy Edge Functions | `supabase/functions/*` | `supabase functions deploy` | Alta usuarios y push | Invoke desde app sin 404 |
| 4 | Storage bucket | Dashboard Supabase | `payment-proofs` + policies | Subida comprobantes | Residente sube imagen; admin ve preview |
| 5 | Fix env templates | `mobile/.env.example` | Solo placeholders anon/public | Evitar filtrar secretos | Revisión git; app con `.env` local real |
| 6 | Web env + landing | `web/.env.local`, `web/app/page.tsx` | Links a rutas producto | Demo caseta/admin sin recordar URLs | Abrir `/` y navegar |
| 7 | Usuarios demo | Supabase Auth + profiles | 1 por rol + property_id | Probar todos los flujos | Matriz de roles entra a su shell |
| 8 | Emergencia mínima | Nueva migración RPC + `(resident)/index.tsx` | Insert alerta/log + opcional push a guards | Requisito producto caseta | Long-press crea fila consultable por guardia |
| 9 | Chat → bot | `mobile/app/(security)/chat.tsx` | `EXPO_PUBLIC_BOT_URL` + fetch `guard-reply` | Proxy útil en demo | Mensaje guardia llega a WhatsApp |
| 10 | Push config | SQL `ncoto_internal.push_edge_config` | URL función + secrets | Avisos/pagos notifican | Insert aviso → notificación en dispositivo físico |
| 11 | Bot operativo | `bot/.env`, deploy | QR o Meta + cron | Paquetería EOD | Job manual `POST /jobs/paqueteria-followup` |
| 12 | QA manual | Sección 8 abajo | — | Regresión antes de demo | Checklist completada |

---

## 8. Plan de pruebas manuales (QA punta a punta)

### Entorno

- [ ] Migraciones aplicadas en Supabase remoto
- [ ] Edge Functions desplegadas
- [ ] `mobile/.env` y `web/.env.local` con URL + anon key correctos
- [ ] Al menos 1 `coto`, N `properties`, usuarios: resident (approved), guard, coto_admin, admin

### Auth y onboarding

- [ ] Registro nuevo → onboarding → pantalla espera
- [ ] Admin aprueba en Directorio → residente accede a Inicio
- [ ] Admin rechaza → residente no accede
- [ ] Login/logout por rol redirige correctamente

### Visitas (residente)

- [ ] Crear eventual, servicio (chip + Otro), paquetería, frecuente
- [ ] Ver QR y compartir
- [ ] Historial / re-enviar formulario
- [ ] Con mora: no crear visita (UI + error RLS si forzaran API)

### Morosidad

- [ ] Admin marca casa en mora → residente ve banner sin reiniciar app (Realtime)
- [ ] Admin quita mora → residente puede generar visita
- [ ] Web caseta bloquea ingreso si moroso
- [ ] Móvil caseta bloquea ingreso si moroso

### Caseta

- [ ] Web: escaneo HID válido / inválido / fuera de horario
- [ ] Web: lista “previstas hoy” + simular escaneo
- [ ] Móvil: cámara + confirmar ingreso
- [ ] Tras ingreso: estado visita `used` (o `last_access_at` frecuente)

### Admin

- [ ] Superadmin cambia coto activo → datos del panel cambian
- [ ] Crear usuario guard y residente
- [ ] Aprobar/rechazar comprobante; ver ingreso en tesorería (board)

### Mesa directiva

- [ ] board_member ve tab Tesorería
- [ ] Registrar egreso manual (si aplica)

### Avisos

- [ ] Publicar alerta → visible según audiencia / rol

### Integraciones

- [ ] Push (si configurado): aviso o cambio de pago
- [ ] Bot: mensaje proxy o follow-up paquetería (si bot corriendo)
- [ ] Emergencia: documentar como “no MVP” o probar tras implementar

### Regresión

- [ ] `npm test` en `mobile/` (vitest visitas)
- [ ] `npm run build` en `web/`

---

## 9. Preguntas / huecos de información

Solo lo que **no se puede confirmar** solo con el repo:

1. **¿Qué migraciones están ya aplicadas** en el proyecto Supabase de producción/staging? (lista exacta vs las 13 archivos en `supabase/migrations/`).
2. **¿Edge Functions `admin-create-user` y `push-notifications` están desplegadas** y con secrets configurados?
3. **¿Existe el coto y propiedades seed** (`00000000-0000-4000-8000-000000000001` y casas reales del fraccionamiento piloto)?
4. **¿Confirmación de email** está activada en Supabase Auth? (afecta registro).
5. **¿Estrategia de despliegue del bot** (WhatsApp Web en VM vs Meta Cloud API) y URL pública para `guard-reply`.
6. **¿Alcance MVP acordado con negocio?** ¿Incluye pagos/tesorería/push o solo visitas+caseta+mora?
7. **¿Hay proyecto EAS** con `projectId` para push en builds de TestFlight/APK?
8. **Estado real de datos**: cuántos usuarios/perfiles existen hoy y si tienen `property_id` poblado.
9. **¿La clave en `mobile/.env.example` es real?** Si sí, debe rotarse de inmediato en Supabase.
10. **¿Caseta en demo usa web, móvil o ambos?** Define si la paridad “lista hoy” en móvil es obligatoria.

---

## Nota para compartir con ChatGPT u otros colaboradores

NCoto es gestión de fraccionamientos con **Expo + Supabase + Next.js (caseta/admin) + bot WhatsApp**. El cierre MVP depende menos de features nuevos y más de **despliegue coherente** (migraciones, functions, storage, env, usuarios demo) y de **2–3 huecos de producto** (emergencia, chat→bot, landing web).

Documentos relacionados en el repo (pueden estar desactualizados):

- `PROJECT_STATUS.md` — backlog y stack
- `PRODUCT_STATUS_MVP.md` — auditoría por módulo (parcialmente obsoleta)
- `MVP_STATUS.md` — brechas iniciales (pre-pagos/directorio)
- `ROLES_AND_PERMISSIONS.md` — diseño de roles y multi-tenancy

**Este archivo (`MVP_ARCHITECTURE_AUDIT.md`) es la referencia consolidada para cierre de MVP a partir de la auditoría del código.**

---

*Última actualización: auditoría estática del repositorio NCoto.*
