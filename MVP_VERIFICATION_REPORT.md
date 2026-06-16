# NCoto — Verificación real del MVP (E2E readiness)

Documento de **verificación operativa** (no auditoría estática sola). Generado tras ejecutar checks locales y consultas CLI al proyecto Supabase enlazado.

**Alcance de lo confirmado en esta máquina:**

| Verificación | Método | Resultado |
|--------------|--------|-----------|
| TypeScript mobile | `npx tsc --noEmit` en `mobile/` | ✅ Sin errores |
| TypeScript bot | `npx tsc --noEmit` en `bot/` | ✅ Sin errores |
| ESLint mobile | `npm run lint` (expo lint) | ✅ 0 errores, 11 warnings |
| Tests mobile | `npm test` (vitest) | ✅ 15/15 tests |
| Build web | `npm run build` (Next.js 16) | ✅ OK — rutas: `/`, `/admin/dashboard`, `/guardia/scan`, `/mesa/tesoreria` |
| Archivos `.env` locales | `Test-Path` | ✅ `mobile/.env`, `web/.env.local`, `bot/.env` existen |
| Migraciones remotas | `supabase migration list` | ✅ **13/13** locales = remotas (sincronizadas) |
| Edge Functions remotas | `supabase functions list` | ⚠️ Solo `admin-create-user` desplegada |
| SQL remoto (bucket, push config, seed) | `supabase db query` | ❌ No ejecutado — CLI intentó DB **local** (no levantada) |

**No ejecutado en esta sesión:** `expo start`, pruebas manuales en dispositivo, login real contra Auth, escaneo QR físico, subida Storage en runtime.

---

## 1. Verificación de entorno

### 1.1 Mobile (`mobile/`)

| Variable | Obligatoria MVP | Uso en código | Estado local |
|----------|-----------------|---------------|--------------|
| `EXPO_PUBLIC_SUPABASE_URL` | **Sí** | `mobile/src/lib/supabase.ts` | ✅ Presente (`mobile/.env` existe; lint exportó la variable) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Sí** | Cliente Supabase Auth + PostgREST | ✅ Presente (no se leyó el valor por seguridad) |
| `EXPO_PUBLIC_EDGE_FN_ADMIN_CREATE_USER` | No | `profiles/repo.ts` — default `admin-create-user` | Opcional |

**No existe en código (pero se menciona en docs):**

| Variable | Notas |
|----------|--------|
| `EXPO_PUBLIC_BOT_URL` | Chat guardia usa URL **hardcodeada comentada** `http://TU_BOT_URL/guard-reply` en `chat.tsx` — no hay env var implementada |

**Inconsistencias detectadas:**

| Problema | Evidencia | Impacto |
|----------|-----------|---------|
| `mobile/.env.example` etiqueta mal la clave | Comentario dice "anon public" pero el ejemplo usa prefijo `sb_secret_...` | Riesgo de copiar secret/service key al cliente |
| Sin validación al arranque si URL/key vacíos | `supabase.ts` usa `\|\| ''` | App arranca pero todas las llamadas fallan en runtime |
| Push sin `eas.projectId` en `app.json` | `useRegisterExpoPushToken.ts` — `resolveExpoProjectId()` devuelve `undefined` si no hay `extra.eas.projectId` | Push puede fallar en build standalone; en Expo Go a veces funciona |

**Críticas para MVP demo (mobile):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

### 1.2 Web (`web/`)

| Variable | Obligatoria MVP | Uso | Estado local |
|----------|-----------------|-----|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Sí** (caseta/admin/mesa) | `GuardScanClient`, `CotoPropertiesDashboard`, `BoardTreasuryClient` | ✅ `web/.env.local` existe; build cargó `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Sí** | Mismo | ✅ |

**No hay** `web/.env.example` en el repo.

**Críticas para MVP demo (web):** ambas `NEXT_PUBLIC_*`. Sin ellas, `createBrowserSupabase()` lanza error en runtime (confirmado en código).

**Rutas web que compilan y existen:**

- `/guardia/scan` — caseta (core demo)
- `/admin/dashboard` — morosidad
- `/mesa/tesoreria` — tesorería mesa
- `/` — plantilla Next **sin enlaces** al producto

---

### 1.3 Bot (`bot/`)

| Variable | Obligatoria | Modo | Uso |
|----------|-------------|------|-----|
| `SUPABASE_URL` | **Sí** | Ambos | `proxyService.ts`, `packageFollowupService.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Ambos | Service role (nunca en mobile/web) |
| `PORT` | No | Ambos | Default `3000` |
| `MESSAGING_PROVIDER` | No | Ambos | `whatsapp_web_js` (default) o `meta_cloud_api` |
| `PACKAGE_FOLLOWUP_CRON` | No | Cron paquetería | Default `59 23 * * *` |
| `PACKAGE_FOLLOWUP_TZ` | No | Cron | Default `America/Mexico_City` |
| `CRON_HTTP_SECRET` | No | `POST /jobs/paqueteria-followup` | Si vacío, endpoint menos protegido |
| `META_WHATSAPP_VERIFY_TOKEN` | Sí si Meta | Webhook GET verify | `webhook.ts` |
| `META_WHATSAPP_ACCESS_TOKEN` | Sí si Meta | `metaConfig.ts` |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Sí si Meta | `metaConfig.ts` |
| `WHATSAPP_CLOUD_TOKEN` / `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Alt. legacy | `metaConfig.ts` | |
| `WHATSAPP_CLOUD_API_VERSION` | No | Default `v21.0` | |

**Estado local:** `bot/.env` existe (contenido no inspeccionado).

**Críticas para MVP demo (bot):** solo si la demo incluye WhatsApp o cron paquetería. **No crítico** para demo “visitas + caseta web + mora”.

---

### 1.4 Edge Functions (Supabase hosted)

Supabase inyecta automáticamente en runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

| Función | Secrets adicionales | Deploy remoto (CLI) |
|---------|---------------------|---------------------|
| `admin-create-user` | Ninguno en código | ✅ **ACTIVE** (v1, 2026-04-21) |
| `push-notifications` | `PUSH_NOTIFICATIONS_WEBHOOK_SECRET` | ❌ **No aparece** en `supabase functions list` |

**Config manual en BD (no es env del cliente):** tabla `ncoto_internal.push_edge_config` — INSERT comentado al final de `20260516120000_expo_push_notifications_triggers.sql`. Sin fila + sin función desplegada, los triggers de push **no hacen nada** (la función `enqueue_push_notification` retorna early si no hay config).

---

### 1.5 Resumen entorno — qué falta / inconsistente

| Ítem | Severidad |
|------|-----------|
| `push-notifications` no desplegada | Alta si demo incluye push |
| `push_edge_config` en BD (no verificado en remoto) | Alta para push |
| `mobile/.env.example` con clave tipo secret | Alta seguridad / onboarding dev |
| Sin `web/.env.example` | Media |
| Bot URL no parametrizada en mobile chat | Media (proxy WhatsApp) |
| Sin `eas.projectId` para push en producción | Media |

---

## 2. Verificación de Supabase

### 2.1 Migraciones — estado REAL remoto

Comando: `supabase migration list` (proyecto enlazado).

```
Local          | Remote         — TODAS COINCIDEN
20260418120000 … 20260524120000 (13 archivos)
```

**Confirmado:** las 13 migraciones del repo están aplicadas en el proyecto remoto enlazado.

**No confirmado en esta sesión:** contenido exacto de datos (cotos, properties, usuarios), bucket storage, fila `push_edge_config`, publicación Realtime (requiere SQL en Dashboard o DB remota; `supabase db query` falló porque no hay Postgres local en `127.0.0.1:54322`).

---

### 2.2 Enums — evolución y riesgos

| Enum | Valores finales (tras migraciones) | Notas |
|------|--------------------------------------|-------|
| `user_role` | `resident`, `guard`, `admin`, `coto_admin`, `board_member` | `coto_admin` en `20260419120000`; `board_member` en migración **dedicada** `20260516095500` (evita error 55P04) |
| `profile_approval_status` | `pending`, `approved`, `rejected` | `20260523120000` |
| `occupancy_kind` | `owner`, `tenant` | `20260523120000` |
| `payment_submission_status` | `pending`, `approved`, `rejected` | `20260515120000` |
| `coto_finance_entry_type` | `payment_income`, `manual_expense` | `20260516100000` |
| `announcement_category` / `announcement_audience` | Varios incl. `board_members` | `20260516100000` |

**Inconsistencia de producto (no de deploy):** código TypeScript y UI usan `board_member`; no hay “Partner Admin”.

---

### 2.3 Funciones redefinidas (intencional vs conflicto)

| Función | Veces en migraciones | Versión efectiva |
|---------|----------------------|------------------|
| `handle_new_user_profile` | `20260523120000`, `20260524120000` | **Gana `20260524120000`:** nuevo usuario → `role=resident`, `approval_status=pending` |
| `profiles_enforce_role_change` | `18120000`, `19120000`, `16100000` | **Gana `16100000`:** incluye bloqueo para `board_member` |
| `profiles_select_tenant` | `18120000`, `19120000`, `16100000` | **Gana `16100000`:** admin, coto_admin, resident, board_member pueden listar perfiles del tenant |
| `peek_visit_exists_for_security` | `18120000`, `19120000` | **Gana `19120000`:** usa `coto_id` físico del guardia |
| `current_user_coto_id` | `19120000` | Superadmin: `COALESCE(active_coto_id, coto_id)` |
| `visits_insert_tenant` | `18120000`, `20120000` | **Gana `20120000`:** añade `NOT current_user_property_is_delinquent()` |
| `announcements_insert_publishers` | `16100000`, `22120000` | **Gana `22120000`:** incluye **`coto_admin`** (corrige exclusión de `16100000`) |

**Conclusión:** no hay migraciones duplicadas “rotas” en el sentido de orden incorrecto; hay **reemplazos explícitos** donde la última migración gana. Riesgo solo si alguien aplica migraciones fuera de orden manualmente.

**Conflicto histórico resuelto en repo:** `20260523120000` creaba usuarios con `approval_status=approved`; `20260524120000` lo cambia a `pending` — coherente con flujo onboarding actual.

---

### 2.4 Políticas — puntos de atención

| Política | Observación |
|----------|-------------|
| `visits_select_tenant` | Residente ve las suyas; guard ve todas del coto (RLS) — necesario para bitácora |
| `visits_insert_tenant` | Bloquea morosos en servidor |
| `payment_proofs_*` (storage) | Path `{auth.uid}/{uuid}.ext` — alineado con `payments/repo.ts` |
| `announcements_insert_publishers` | Publicar: admin, coto_admin, guard, board_member |
| `announcements_select_tenant` | Lectura segmentada por audiencia y rol |

**Posible confusión UI (no RLS):** `announcements.tsx` — `canView` solo `admin` \| `coto_admin`; `canPublish` incluye guard/board pero esos roles **no usan** tabs admin. No rompe MVP si no se promete avisos desde guardia en app admin.

---

### 2.5 RPCs críticas para flujos MVP

| RPC | Rol | Confirmada en migraciones |
|-----|-----|---------------------------|
| `peek_visit_exists_for_security` | guard | ✅ |
| `peek_visit_resident_is_delinquent` | guard | ✅ |
| `mark_visit_used` | guard (vía cliente autenticado) | ✅ En schema archive + uso en repos |
| `current_user_property_is_delinquent` | resident / RLS | ✅ |
| `current_user_coto_id` | tenant | ✅ |

**No verificado en runtime:** que `GRANT EXECUTE` esté activo para `authenticated` en remoto (definido en migraciones; asumido OK si migraciones aplicadas).

---

### 2.6 Storage

| Bucket | Definición | Confirmación remota |
|--------|------------|---------------------|
| `payment-proofs` | `INSERT` en `20260515120000_*` (privado, 5MB, mime imágenes) | ⚠️ **No confirmado** por SQL remoto en esta sesión |

**Dependencia runtime:** subida en `uploadPaymentProofAndCreateSubmission` → `supabase.storage.from('payment-proofs').upload(...)`.

---

### 2.7 Realtime

Migración `20260422140000_realtime_properties.sql` añade `public.properties` a publicación `supabase_realtime` si no estaba.

**Uso en app:** `(resident)/index.tsx`, `(admin)/index.tsx` — canales `postgres_changes` en `properties`.

**Confirmación remota:** ⚠️ no ejecutada (requiere consulta a `pg_publication_tables` en proyecto remoto).

---

### 2.8 Edge Functions — estado REAL

| Función | En repo | Desplegada remoto |
|---------|---------|-------------------|
| `admin-create-user` | ✅ | ✅ ACTIVE |
| `push-notifications` | ✅ | ❌ **NO desplegada** |

**Impacto:** triggers `trg_push_on_announcement_insert` y `trg_push_on_payment_submission_status` existen en BD pero la cadena push **no completa** sin función + `push_edge_config`.

---

### 2.9 Columnas / referencias obsoletas

| Ítem | Estado |
|------|--------|
| `jwt_email_contains_guardia()` | Eliminada en `20260418120000` — correcto |
| Tabla `residents` (teléfonos bot) | Sigue en schema archive; bot `proxyService` la usa |
| Tabla `deliveries` | Sin UI mobile — huérfana de producto |
| `mobile/app/visit/[id].tsx` | Ruta `/visit/[id]` legacy; flujo actual usa `/(resident)/visit/[id]` |
| `mobile/app/(tabs)/` | Template con tab `scan` **sin archivo** `scan.tsx` — huérfano si alguien navega a `/(tabs)` |

---

## 3. Verificación de compilación

### 3.1 Resultados ejecutados

| Proyecto | Comando | Resultado |
|----------|---------|-----------|
| mobile | `tsc --noEmit` | ✅ Pass |
| mobile | `expo lint` | ✅ 0 errors, 11 warnings (hooks deps, unused imports) |
| mobile | `vitest run` | ✅ 15 tests (qr + validation) |
| web | `next build` | ✅ Pass, 7 páginas estáticas |
| bot | `tsc --noEmit` | ✅ Pass |

### 3.2 Imports y rutas

| Hallazgo | Riesgo | Detalle |
|----------|--------|---------|
| Alias `@/*` → `./*` | Bajo | `tsconfig.json` + usado consistentemente |
| `(tabs)/_layout` referencia `scan` sin `scan.tsx` | Medio | Solo si navegación cae en `/(tabs)` — flujo principal usa `(resident)` |
| `app/visit/[id].tsx` duplicado | Bajo | Ruta alternativa no usada por navegación principal |
| `crypto.randomUUID()` en `payments/repo.ts` | Medio | Depende de runtime RN/Hermes; si falla, subida de comprobante rompe — **no probado en dispositivo** |
| Expo Router typed routes | Bajo | `experiments.typedRoutes: true`; varios `as any` en `router.push` |

### 3.3 Hooks (warnings lint — no bloquean build)

- `scopeVersion` en deps de `useCallback` marcado innecesario (varias pantallas admin).
- `CotoScopeContext`: falta `session?.user` en deps.
- `announcements.tsx`: `load` faltante en deps de un callback.

**Impacto MVP:** bajo; posibles refetch extra o stale data en casos borde.

### 3.4 Dependencias

- `mobile/package.json` y `web/package.json`: dependencias instaladas (builds exitosos).
- No se detectaron imports a paquetes ausentes en compilación.

---

## 4. Verificación de flujos reales

Escala de riesgo: **bajo** = compilación + migraciones OK, poco externo; **medio** = depende de datos/config/manual; **alto** = no desplegado o código incompleto.

Orden recomendado de prueba manual: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**.

---

### 4.1 Login

| | |
|--|--|
| **Dependencias** | `EXPO_PUBLIC_SUPABASE_*`; usuario en Auth + fila `profiles` con `role`, `coto_id` |
| **Qué puede romperse** | Perfil ausente → `authIssue=missing_profile`; email no confirmado si Auth lo exige |
| **Probar primero** | Sí — **#1** |
| **Riesgo** | **Bajo** (con `.env` existente y usuarios seed) |

**Confirmado en código:** `useAuth.ts` carga `profiles`; `index.tsx` redirige por rol desde BD (no por email).

---

### 4.2 Onboarding + aprobación

| | |
|--|--|
| **Dependencias** | Migraciones `approval_status`, onboarding columns; coto `00000000-0000-4000-8000-000000000001`; admin con acceso a directorio |
| **Qué puede romperse** | Registro sin coto seed → excepción trigger; casa no existe en `properties` al aprobar → approve falla o no vincula `property_id` |
| **Probar primero** | **#2** (si demo incluye vecinos nuevos) |
| **Riesgo** | **Medio** (datos seed + flujo admin) |

**Confirmado remoto:** migraciones de onboarding aplicadas. **No confirmado:** existencia del coto default ni casas en `properties`.

---

### 4.3 Crear visita + QR

| | |
|--|--|
| **Dependencias** | Residente `approved`, no moroso, `property_id` recomendado; RLS insert; columnas `visit_type`, `valid_day`, etc. |
| **Qué puede romperse** | Moroso: RLS + UI; visita fuera de ventana en caseta (validación TS) |
| **Probar primero** | **#3** — core demo |
| **Riesgo** | **Bajo** |

**Tests automáticos:** qr encode/decode y `canValidateVisitNow` — ✅ 15 tests.

---

### 4.4 Escanear QR / confirmar ingreso

| | |
|--|--|
| **Dependencias** | Usuario `guard` logueado; RPCs peek + `mark_visit_used`; web: `NEXT_PUBLIC_*` + lector HID o simulación |
| **Qué puede romperse** | Guard en coto distinto al de la visita; visita expirada; moroso (web + móvil implementan peek) |
| **Probar primero** | **#4** — usar **web `/guardia/scan`** para demo estable (teclado HID) |
| **Riesgo** | **Bajo** (web build OK) / **Medio** (móvil: permisos cámara) |

**Paridad:** web tiene lista “previstas hoy”; móvil guardia no — no bloquea si caseta usa web.

---

### 4.5 Morosidad

| | |
|--|--|
| **Dependencias** | Tabla `properties`, Realtime publicado, admin con `effectiveCotoId` |
| **Qué puede romperse** | Realtime no publicado → UI no actualiza hasta refresh; superadmin sin coto activo seleccionado |
| **Probar primero** | **#5** después de visita creada |
| **Riesgo** | **Medio** (Realtime no verificado en remoto) |

**Confirmado:** toggles en `(admin)/index.tsx` y bloqueo en `[id].tsx` (mora).

---

### 4.6 Pagos (comprobantes)

| | |
|--|--|
| **Dependencias** | `property_id` en perfil residente; bucket `payment-proofs`; Storage policies; admin en tab Pagos |
| **Qué puede romperse** | Bucket ausente; `crypto.randomUUID`; permiso galería; signed URL admin |
| **Probar primero** | **#6** — solo si demo financiera |
| **Riesgo** | **Alto** sin confirmar bucket en remoto / dispositivo real |

---

### 4.7 Directorio (aprobar vecinos)

| | |
|--|--|
| **Dependencias** | `profiles` con columnas directorio; RLS select tenant; `approveResident` en `directoryRepo.ts` |
| **Qué puede romperse** | Columnas faltantes → fallback select básico (warning en consola); casa duplicada |
| **Probar primero** | Con onboarding (#2) |
| **Riesgo** | **Medio** |

**Compilación:** `directory.tsx` completo — sin errores TS.

---

### 4.8 Alta usuarios (Edge Function)

| | |
|--|--|
| **Dependencias** | Sesión admin/coto_admin/resident según caso; función `admin-create-user` desplegada |
| **Qué puede romperse** | 403 por rol; 404 si slug incorrecto |
| **Probar primero** | Antes de demo si necesitas usuarios nuevos |
| **Riesgo** | **Bajo** — función **confirmada ACTIVE** en remoto |

---

### 4.9 Tesorería (board_member)

| | |
|--|--|
| **Dependencias** | Rol `board_member` en enum; tab visible en `(resident)/_layout`; RLS `coto_finances` |
| **Qué puede romperse** | Usuario sin rol board; políticas finances |
| **Probar primero** | Último — opcional demo |
| **Riesgo** | **Medio** |

**Web:** `/mesa/tesoreria` compila — alternativa demo en navegador.

---

### 4.10 Flujos a tratar como NO-MVP (código incompleto)

| Flujo | Riesgo | Motivo |
|-------|--------|--------|
| Emergencia | **Alto** si se promete | Solo `Alert` local — sin backend |
| Push notifications | **Alto** | Función no desplegada + config BD probablemente vacía |
| Chat guardia → WhatsApp | **Alto** | Fetch al bot comentado |
| Bot / proxy completo | **Alto** | Requiere servicio aparte + sesión WA |
| Avisos push automáticos | **Alto** | Misma cadena push rota |

---

## 5. Plan de cierre MVP REAL

### 5.1 Camino más corto a demo estable (≈ 1–2 días operativos)

**Demo núcleo recomendada (“visitas + caseta + mora”):**

1. Validar usuarios seed en Supabase Dashboard (1 resident approved + property, 1 guard, 1 admin/coto_admin).
2. Mobile: `cd mobile && npx expo start` — login residente → crear visita → mostrar QR.
3. Web: `cd web && npm run dev` → `/guardia/scan` — login guard → escanear o simular desde lista → confirmar ingreso.
4. Admin mobile o web `/admin/dashboard` — toggle mora → repetir escaneo (debe bloquear).
5. Opcional: directorio — aprobar un vecino pendiente si quieren mostrar onboarding.

**Ventaja verificada:** migraciones remotas al día; `admin-create-user` desplegada; builds web/mobile/bot compilan.

---

### 5.2 Qué ignorar por ahora (no bloquean demo núcleo)

- Push notifications (función + `push_edge_config`)
- Bot WhatsApp y chat proxy
- Emergencia con alerta a caseta
- Tesorería / pagos / board_member (a menos que el cliente los exija en la misma demo)
- Landing `/` en web
- Carpeta `(tabs)` legacy
- Tabla `deliveries`
- Tests E2E / CI
- Partner Admin / catálogo proveedores editable

---

### 5.3 Qué desactivar temporalmente (comunicación, no código)

| En demo | Decir al cliente |
|---------|------------------|
| Botón Emergencia | “Próximamente — aviso a caseta” |
| Tab Pagos / comprobantes | Omitir o “fase 2” |
| Push | No prometer notificaciones |
| Chat en app guardia | No abrir pantalla `chat` |
| Avisos con notificación | Publicar aviso OK en UI; sin push |

**No hace falta desactivar en código** para demo núcleo si no navegas a esas pantallas.

---

### 5.4 Qué DEBE funcionar sí o sí (definición MVP demo mínima)

| # | Capacidad | Canal |
|---|-----------|--------|
| 1 | Login por rol | Mobile |
| 2 | Residente crea visita y muestra QR | Mobile |
| 3 | Guardia valida ingreso (o rechaza por mora/horario) | **Web `/guardia/scan`** (preferido) o mobile |
| 4 | Admin marca/desmarca mora | Mobile admin o web admin |
| 5 | Moroso no crea visitas | Mobile (UI + RLS) |

**Opcional stretch:** aprobar vecino en directorio; alta usuario vía Edge Function (ya desplegada).

---

### 5.5 Acciones mínimas pendientes (sin refactors)

| Prioridad | Acción | Esfuerzo |
|-----------|--------|----------|
| P0 | Confirmar en Dashboard: bucket `payment-proofs` (solo si demo pagos) | 5 min |
| P0 | Seed: coto default + properties + usuarios demo con `property_id` | 30–60 min SQL/manual |
| P0 | Prueba manual guiada sección 8 (abajo) en dispositivo real | 2–3 h |
| P1 | `web/app/page.tsx` — links a `/guardia/scan` y `/admin/dashboard` | 15 min (cuando pidan código) |
| P1 | Corregir `mobile/.env.example` (placeholder anon, no secret) | 5 min |
| P2 | Deploy `push-notifications` + INSERT `push_edge_config` | Solo si push en demo |
| P2 | `EXPO_PUBLIC_BOT_URL` + descomentar fetch en `chat.tsx` | Solo si WhatsApp en demo |

---

## 6. Modo estricto — límites de esta verificación

| Afirmación | ¿Confirmada? |
|------------|--------------|
| Migraciones aplicadas en remoto | ✅ Sí (CLI) |
| `admin-create-user` desplegada | ✅ Sí (CLI) |
| `push-notifications` desplegada | ❌ No (CLI) |
| Bucket `payment-proofs` existe | ⚠️ No verificado (SQL remoto no ejecutado) |
| Realtime en `properties` activo | ⚠️ No verificado |
| `push_edge_config` poblado | ⚠️ No verificado |
| Login/visitas/mora funcionan en runtime | ⚠️ No probado en dispositivo esta sesión |
| Contenido de `.env` es correcto | ⚠️ Archivos existen; valores no auditados |
| Bot conectado y estable | ⚠️ No ejecutado |

---

## 7. Checklist QA manual (orden sugerido)

### Pre-flight (5 min)

- [ ] `mobile/.env` con URL y anon key válidos
- [ ] `web/.env.local` con mismos proyecto/anon
- [ ] Usuarios demo creados en Auth + `profiles` completos

### Núcleo demo (30–45 min)

- [ ] **Login** resident → home `(resident)`
- [ ] **Login** guard → security o web caseta
- [ ] **Login** admin → panel morosidad
- [ ] **Crear visita** eventual → ver QR
- [ ] **Caseta web** escanear/simular → ingreso OK
- [ ] **Admin** marcar mora → residente ve restricción
- [ ] **Caseta** reintentar ingreso → bloqueo moroso
- [ ] **Admin** quitar mora → residente crea visita otra vez

### Stretch (si aplica)

- [ ] Registro → onboarding → waiting → admin aprueba en Directorio
- [ ] Admin crea usuario guard vía Usuarios
- [ ] Subir comprobante (solo si bucket confirmado)
- [ ] board_member tesorería

### Regresión automática (ya pasó en máquina dev)

- [ ] `cd mobile && npm test`
- [ ] `cd web && npm run build`

---

## 8. Relación con otros documentos

| Documento | Uso |
|-----------|-----|
| `MVP_ARCHITECTURE_AUDIT.md` | Mapa estático del producto y módulos |
| **`MVP_VERIFICATION_REPORT.md` (este)** | Qué compila, qué está desplegado, qué probar y en qué orden |
| `PROJECT_STATUS.md` | Backlog — puede estar desactualizado |

---

*Generado tras verificación local + `supabase migration list` + `supabase functions list` + builds/tests. Actualizar tras primera demo en dispositivo con resultados pass/fail por flujo.*
