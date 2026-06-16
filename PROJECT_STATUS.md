# NCoto — Estado del proyecto

Documento vivo para alinear alcance, stack y backlog. Las tareas completadas se marcan con `[x]`; las pendientes o en curso con `[ ]`. Actualizar este archivo al cerrar cada entrega.

---

## Misión del proyecto

**Gestión residencial multi-tenant:** plataforma para fraccionamientos (*cotos*) que centraliza acceso de visitantes (pases QR), comunicación con caseta (app de seguridad), mensajería vía WhatsApp y gobierno financiero por unidad (*morosidad*) — con aislamiento de datos por `coto` y roles definidos en base de datos.

---

## Características implementadas

- [x] **Autenticación y perfiles** — Supabase Auth (email/contraseña), tabla `profiles` ligada a `auth.users`, roles (`resident`, `guard`, `admin`, `coto_admin`), multi-tenant con `cotos` y RLS por `coto_id`; superadmin con `active_coto_id` y selector de coto en la app. El perfil móvil incluye `property_id` para Realtime y datos de unidad.
- [x] **Visitas y QR** — Creación de pases (eventual, frecuente, servicio, paquetería), placas, proveedores/paquetería predefinidos + “Otro”, QR versionado, detalle residente y flujo de seguridad con `mark_visit_used` / RPC de verificación.
- [x] **Bot de WhatsApp** — Servidor Node.js (Express) con WhatsApp Web y soporte previsto para Meta Cloud API; proxy guardia↔residente (`proxy_sessions`, `proxy_messages`); cron / job para paquetería.
- [x] **Registro de entregas (BD)** — Tabla `deliveries` multi-tenant. *(UI móvil dedicada: pendiente según roadmap.)*
- [x] **Alta de usuarios (Edge Function)** — Función `admin-create-user` en `supabase/functions/`; el cliente móvil usa **`supabase.functions.invoke()`** (misma base URL que el cliente Auth) para evitar 404 por URL manual incorrecta. Slug sobrescribible con `EXPO_PUBLIC_EDGE_FN_ADMIN_CREATE_USER`.
- [x] **Directorio y residentes** — Modelo `residents`; rutas `(admin)` según proyecto.
- [x] **Morosidad en datos** — Tabla `properties`, `property_id` en perfiles, helpers `current_user_property_is_delinquent()`, RLS en `INSERT` de `visits`, RPC `peek_visit_resident_is_delinquent` para caseta.
- [x] **App móvil residente (UX)** — Home con banner (`cotos.banner_image_url` + migración), logo, acciones Generar/Emergencia, pases próximos, cuenta y cierre de sesión con `router.replace` al login; bloqueo morosidad (`pointerEvents` + redirect forzado desde pestaña **Visitas** a Home); historial con pestañas, badges, re-enviar formulario; Realtime en `properties` para actualizar `isDelinquent` al instante (requiere publicación `supabase_realtime` + migración `20260422140000_realtime_properties.sql`).
- [x] **Web caseta `/guardia/scan`** — Lector HID, lista del día, chequeo de morosidad antes de ingreso; **modal crítico** si hay adeudo (solo **recarga de página**, sin cerrar con “alerta”); placas editables antes de confirmar; botón de ingreso deshabilitado si `delinquent`.

---

## Stack tecnológico actual

| Capa | Tecnología |
|------|------------|
| Backend / datos | **Supabase** (Postgres, Auth, RLS, Edge Functions, Realtime) |
| App móvil | **React Native** + **Expo** + **Expo Router** |
| Bot / jobs | **Node.js** (Express, WhatsApp, cron); `bot/metaConfig.ts` |
| Web producto | **Next.js** en `web/` — caseta escaneo (`GuardScanClient`) |

---

## Módulo de morosidad

- [x] Tabla `properties`, backfill, RLS, helpers y bloqueo de creación de visitas (residente moroso).
- [x] Caseta: bloqueo de flujo de ingreso + UI de denegación + edición de placas.
- [x] App: bloqueo UI + redirect Visitas → Home + Realtime sobre fila de propiedad.
- [ ] **Bot de WhatsApp** — Degradar o bloquear mensajes automáticos cuando la unidad esté en mora (mensajes claros).

---

## Próximos pasos (backlog)

### Operación y despliegue

- [ ] **Desplegar Edge Function** `admin-create-user` en el proyecto Supabase (Dashboard → Edge Functions o CLI `supabase functions deploy`). Sin despliegue, `invoke` devolverá error de función no encontrada.
- [ ] **Aplicar migraciones pendientes** en remoto: `banner_image_url` en `cotos`, Realtime en `properties`, RPC morosidad caseta si aún no están.

### Producto

- [ ] **Emergencia móvil** — Conectar confirmación a backend (alerta a caseta / log).
- [ ] **Notificaciones / push** — Avisos de pase usado o morosidad (opcional).
- [ ] **Tests E2E** — Flujo residente → QR → caseta.

### Tags vehiculares / hardware

- [ ] Ampliar reglas de validación de placas y reportes para administración.

---

*Última actualización: Edge Function vía `invoke`, Realtime `properties`, guardia modal solo-recarga, redirect morosos en Visitas, `PROJECT_STATUS` consolidado.*
