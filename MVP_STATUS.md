# Estado MVP — NCoto

Resumen basado en un escaneo del repositorio (`mobile` Expo + Supabase, `bot` Express + WhatsApp Web, `web` Next.js vacío de dominio). No hay backend REST propio para el negocio de visitas: la app usa **PostgREST (Supabase)** y RPCs; el **DDL autoritativo no estaba versionado** en el repo (el archivo raíz `esquema_ncoto.sql` está vacío).

## Lo que ya existe (base funcional)

- **App móvil (Expo Router):** login por email/contraseña (Supabase Auth), redirección por rol inferido del email (`guardia` → seguridad, `admin` → admin, resto → residente).
- **Residente:** listado de visitas, creación de visita con nombre, pantalla de detalle con **QR** (payload JSON en Base64: `visitId`, `validUntil`, `createdAt`).
- **Seguridad:** escáner QR que decodifica el payload y abre el detalle; pantalla para confirmar entrada vía RPC `mark_visit_used`.
- **Cliente Supabase** (`mobile/src/lib/supabase.ts`) y repositorio de visitas (`visits`, mapeo snake_case ↔ camelCase).
- **Bot:** Express con rutas `POST /request-contact` y `POST /guard-reply`; cliente WhatsApp; `ProxyService` para sesiones `proxy_sessions` / mensajes `proxy_messages` y tabla `residents` (teléfono con service role).

## Brechas críticas para un MVP “cerrado”

1. **Esquema de base de datos en repo:** migraciones SQL o documentación aplicable a Supabase (tablas `visits`, `residents`, RPCs, RLS). Sin esto, despliegues y revisiones son frágiles.
2. **Políticas RLS:** el código asume lecturas/escrituras permitidas; la **bitácora de seguridad** no puede listar todas las visitas si `listVisits` solo filtra por `resident_id` — hace falta política y consulta para rol guardia (o claims en JWT).
3. **Roles:** los roles se deducen por substring en el email; no hay modelo de usuario/rol en BD ni asignación por administrador.
4. **Multi-coto / unidades:** no hay `coto_id`, unidad o dirección en el modelo visible; todo es global por usuario.
5. **Web (`web/`):** plantilla Next.js sin flujos NCoto (panel admin, registro, etc.).
6. **Notificaciones push:** no implementadas (mencionadas solo en comentarios frente a Realtime).
7. **Pruebas y CI:** no hay tests automatizados ni pipeline visible en el árbol reducido del proyecto.
8. **WhatsApp bot:** dependencia de sesión local (`.wwebjs_auth`), sin estrategia de despliegue/escalado documentada; el servidor HTTP arranca solo tras `client.on('ready')`.

## Funcionalidades de producto aún débiles o ausentes

- Registro self-service de residentes y alta de datos (teléfono, unidad).
- Administración de fraccionamiento (directorio, reglas de acceso).
- Auditoría completa (bitácora alimentada por RPC/triggers coherentes con la app).
- Internacionalización y manejo explícito de zona horaria en reglas de vigencia.

## Nota sobre este documento

Las mejoras de **tipos de visita**, **horarios recurrentes**, **servicio/paquetería un día**, y **seguimiento de paquetería** están en código (`mobile`, `bot`) y en la migración `supabase/migrations/20260417120000_visits_types_package_followup.sql`; deben **aplicarse en el proyecto Supabase** (y ajustarse RLS: lectura de visitas para guardia, tablas `visit_access_log` y `package_followup_prompts`) para que el MVP sea coherente en producción.

El bot programa un **cron** (`PACKAGE_FOLLOWUP_CRON`, `PACKAGE_FOLLOWUP_TZ`) y expone `POST /jobs/paqueteria-followup` con cabecera opcional `x-cron-secret` si defines `CRON_HTTP_SECRET`.
