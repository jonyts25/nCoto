# NCoto — Roles, permisos y evolución hacia WebApp

Documento de arquitectura y análisis de negocio. Se basa en el estado del código en el repositorio (Expo Router en `mobile/`, Next.js en `web/`, Postgres/RLS en `supabase/migrations/`).

---

## 1. Mapa conceptual: roles deseados vs implementación actual

| Rol de negocio (objetivo) | Equivalente actual en BD (`public.user_role`) | Estado |
|---------------------------|--------------------------------------------------|--------|
| **Super Admin** (plataforma) | `admin` | Parcial: selector de coto activo (`active_coto_id`), RLS con `current_user_coto_id()`, listado global de `cotos`. |
| **Partner Admin** (multi-coto) | *No existe* | Ausente: un usuario solo tiene un `coto_id` “hogar” salvo el patrón especial del superadmin. |
| **Admin local** (un coto) | `coto_admin` | Parcial: políticas RLS y Edge Function reconocen `coto_admin`; UI móvil limitada. |
| **Residente** (titular / unidad) | `resident` | Implementado: visitas, perfil, morosidad, usuarios en su coto según políticas. |
| **Inquilino** | *No existe* | Ausente: no hay sub-rol ni `lease`/`occupancy`; todo titular se modela como `resident`. |
| **Delegado** | *No existe* | Ausente: no hay permisos delegados sobre `property_id` o visitas de un tercero. |
| **Guardia** | `guard` | Implementado: app móvil `(security)` + web `/guardia/scan`. |

Enum actual definido en migraciones: `resident`, `guard`, `admin`; `coto_admin` añadido después (`20260419120000_superadmin_coto_scope_and_coto_admin.sql`).

---

## 2. Inventario por rol — rutas, módulos y funciones

### 2.1 Residente (`resident`)

| Área | Ubicación / función | Notas |
|------|---------------------|--------|
| **Rutas móvil** | `mobile/app/(resident)/` — tabs: `index`, `visits`, `profile`, `users` | `_layout.tsx` define navegación principal del residente. |
| **Inicio / QR** | `(resident)/index.tsx` | Pases, banner coto, morosidad UI, Generar visita / Emergencia. |
| **Visitas** | `(resident)/visits.tsx`, `(resident)/visit/[id].tsx` | Creación de pases; historial modal con Re-enviar al formulario. |
| **Gestión usuarios** | `(resident)/users.tsx` → `UsersManagementScreen` | Alta vía Edge Function; roles asignables acotados por política y por UI. |
| **Datos** | `mobile/src/features/visits/repo.ts`, `delinquency/repo.ts`, `properties/repo.ts`, `cotos/repo.ts` | Consultas sin filtro manual de `coto_id` en cliente (defensa en RLS). |
| **RPC / DB** | `current_user_property_is_delinquent()`, política `visits_insert_tenant` (incl. no moroso) | Morosidad coherente con RLS. |

### 2.2 Guardia (`guard`)

| Área | Ubicación / función | Notas |
|------|---------------------|--------|
| **Rutas móvil** | `mobile/app/(security)/` — tabs visibles: `index`, `logs`; ocultos: `[id]`, `chat` | `_layout.tsx` exige `userRole === "guard"`. |
| **Escanear / detalle** | `(security)/index.tsx`, `[id].tsx` | Flujo móvil de verificación (según implementación en esos archivos). |
| **Bitácora** | `(security)/logs.tsx` | Listado / registro según app. |
| **Proxy chat** | `(security)/chat.tsx` | Integración con bot HTTP (`guard-reply`); configuración de URL manual en código de ejemplo. |
| **Web caseta** | `web/app/guardia/scan/page.tsx` → `GuardScanClient` | Lector HID, lista del día, `peek_visit_resident_is_delinquent`, confirmación ingreso. |
| **RPC / DB** | `peek_visit_exists_for_security`, `peek_visit_resident_is_delinquent`, `mark_visit_used` (según `securityRepo`) | **Importante:** las funciones “peek” usan el **`coto_id` físico del perfil del guardia**, no `active_coto_id` (comentario explícito en migración). |

### 2.3 Super Admin (hoy: `admin`)

| Área | Ubicación / función | Notas |
|------|---------------------|--------|
| **Rutas móvil** | `mobile/app/(admin)/` — tabs: `index`, `directory`, `users`, **`announcements`** | La pestaña **Avisos** está declarada en `_layout.tsx` pero **no existe** `announcements.tsx` en `(admin)/` (solo `index`, `directory`, `users`, `_layout`). Riesgo de ruta rota o pantalla vacía según versión de Expo Router. |
| **Panel / directorio** | `(admin)/index.tsx`, `(admin)/directory.tsx` | Placeholders / pantalla casi vacía en directorio. |
| **Usuarios** | `(admin)/users.tsx` → `UsersManagementScreen` | `SuperCotoSelector`, roles amplios (`admin`, `coto_admin`, …) solo superadmin. |
| **Contexto multi-coto** | `CotoScopeContext.tsx`, `SuperCotoSelector.tsx` | Actualiza `profiles.active_coto_id`; `effectiveCotoId` alimenta `scopeVersion` y refetch en `useVisitRepo`. |
| **RLS / SQL** | `current_user_coto_id()` = `COALESCE(active_coto_id, coto_id)` si `role = admin` | Superadmin “ve” datos del coto seleccionado en políticas que usan esta función. |
| **Cotos** | Política `cotos_select`: rol `admin` puede SELECT de todos los cotos | Base para listar cotos en selector. |

### 2.4 Admin local (hoy: `coto_admin`)

| Área | Estado | Notas |
|------|--------|--------|
| **Redirección** | `mobile/app/index.tsx` envía `coto_admin` a `/(admin)` | Misma shell de tabs que superadmin. |
| **RLS** | `profiles_update_by_admin`, `properties_update_admin`, etc. | Incluye `coto_admin` en muchas políticas **dentro del tenant** `current_user_coto_id()`. |
| **Trigger roles** | `profiles_enforce_role_change` | `coto_admin` **no** puede asignar `admin` ni `coto_admin`. |
| **Edge Function** | `supabase/functions/admin-create-user/index.ts` | `coto_admin` solo crea `resident`/`guard` en **su** `coto_id`. |
| **UI diferenciada** | Parcial | `UsersManagementScreen` distingue capacidades; panel y directorio aún genéricos/placeholder. |

### 2.5 Partner Admin, Inquilino, Delegado

| Rol | Qué falta (alto nivel) |
|-----|-------------------------|
| **Partner Admin** | Nuevo valor de enum o tabla `partner_members(partner_id, user_id)` + `partner_cotos`; extender `current_user_coto_id()` (o equivalente) para contexto activo; políticas que permitan saltar de coto **solo** dentro del partner; UI WebApp selector; revisar **Edge Function** y jobs del **bot** para no filtrar solo por `profiles.coto_id` único. |
| **Admin local** (refino producto) | Pantallas admin completas (panel, directorio, avisos), auditoría de acciones, reportes. |
| **Inquilino** | Modelo de ocupación (`property_id` + tipo `owner|tenant`), RLS para que el inquilino vea/edite solo lo permitido; posible mismo enum `resident` con columna `profile_kind` o roles nuevos. |
| **Delegado** | Tabla `delegations` (delegador, delegado, `property_id`, vigencia, permisos bitmask); RLS en `visits` para insertar en nombre del titular o solo gestionar subset; UI explícita. |

---

## 3. Tarea 2 — Auditoría de multi-tenancy (`coto_id`)

### 3.1 Fuente de verdad en Postgres

- **`current_user_coto_id()`** concentra el tenant efectivo para **RLS** en tablas como `visits`, `profiles` (SELECT/UPDATE admin), `properties`, `cotos` (lectura).
- **`profiles.coto_id`**: coto “hogar” del usuario (guardia, residente, admin local).
- **`profiles.active_coto_id`**: solo meaningful para **`role = admin`** (superadmin); persistido en BD y validado por trigger `profiles_enforce_active_coto` (solo superadmin puede cambiarlo).

### 3.2 Consultas en cliente (mobile / web)

- La mayoría de los repos hacen `.from("visits").select(...)` **sin** `.eq("coto_id", …)` explícito; confían en RLS. Esto es **correcto** si todas las políticas usan `current_user_coto_id()`.
- **`listVisits` / `listVisitsScoped`**: no filtra por coto en TS; depende de RLS.
- **Residente home** (`(resident)/index.tsx`): usa `profile.coto_id` para **banner** y metadatos del coto (`fetchCotoById`), no para filtrar visitas manualmente.
- **Guardia web**: Supabase anon + sesión; listas y updates acotados por RLS + RPCs con comprobación de rol y **coto físico** del guardia.

### 3.3 ¿Listos para `partner_admin` cambiando de coto sin cerrar sesión?

**No todavía**, por estas razones:

1. **No hay rol ni datos**: no existe `partner_admin` ni tabla de membresía multi-coto para usuarios que no sean `admin` global.
2. **Patrón actual de “contexto activo”** está acoplado a **`active_coto_id` + trigger “solo `admin`”`**. Un partner admin necesitaría o bien otro campo (`active_coto_id` con reglas distintas) o una tabla de contexto, y actualizar `current_user_coto_id()` en consecuencia.
3. **`coto_admin` hoy** usa solo `coto_id` fijo; `current_user_coto_id()` devuelve `p.coto_id` para roles no admin — **no hay** cambio de contexto.
4. **Edge Function `admin-create-user`**: autoriza por `caller.coto_id` como “home”; un partner con varios cotos requeriría validar contra el conjunto de cotos permitidos.
5. **Bot / jobs** (`bot/src/...`): revisar cada query que asuma un único `coto_id` por usuario o por fila sin pasar por políticas de servicio.

**Recomendación de diseño:** introducir `active_coto_id` (o `session_tenant_id`) para cualquier rol “multi-coto”, gobernado por trigger: valor permitido solo si `(user_id, active_coto_id)` existe en `user_coto_access` (o similar). Unificar lecturas administrativas en `current_user_coto_id()`. Mantener **guardias** siempre anclados al `coto_id` físico del puesto de trabajo (como hoy en `peek_*`).

---

## 4. Tarea 3 — Diseño propuesto: `public.announcements`

Objetivos: segmentar por coto, categorizar, auditar autor y dirigir avisos a audiencias por rol.

### 4.1 Tipo de categoría y audiencia

```sql
CREATE TYPE public.announcement_category AS ENUM ('general', 'seguridad', 'proveedor');

-- Audiencia: quién debe ver el aviso en apps (expandible).
CREATE TYPE public.announcement_audience AS ENUM (
  'all',           -- todos los usuarios del coto con acceso a la app
  'residents',     -- resident + futuros inquilino/delegado si comparten rol app
  'guards',
  'admins'         -- admin + coto_admin del coto
);
```

### 4.2 Tabla principal

```sql
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE CASCADE,
  category public.announcement_category NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  audience public.announcement_audience NOT NULL DEFAULT 'residents',
  pinned boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT announcements_body_len CHECK (char_length(trim(body)) > 0),
  CONSTRAINT announcements_window_ok CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX announcements_coto_created_idx ON public.announcements (coto_id, created_at DESC);
CREATE INDEX announcements_coto_active_idx ON public.announcements (coto_id, starts_at, ends_at);
```

Notas:

- **`created_by`**: ID del perfil del admin que publica (alineado con tu requisito); FK a `profiles` permite JOIN a `display_name`.
- **`target_role`**: se modeló como **`audience`** enum en lugar de un solo `user_role`, porque los avisos suelen ser “a residentes”, “a seguridad” o “a todos”, y en el futuro **inquilino/delegado** podrían mapearse a audiencias sin rediseñar la tabla.
- Si prefieres columna literal `target_role`, alternativa: `target_roles text[]` con check contra valores permitidos, o tabla hija `announcement_targets(role user_role)` para N:M.

### 4.3 Lecturas y RLS (esquema)

- **SELECT**: fila visible si `coto_id = current_user_coto_id()` y `now()` entre `starts_at` y `COALESCE(ends_at, 'infinity')` y la audiencia intersecta el rol del lector (mapear `profiles.role` → audiencia en política o vista).
- **INSERT/UPDATE/DELETE**: solo `admin`, `coto_admin` (y futuro `partner_admin` con contexto de coto) según política de negocio.
- Opcional: **`announcement_reads(user_id, announcement_id, read_at)`** para badges “no leído” en mobile/WebApp.

---

## 5. Tarea 4 — WebApp vs mobile: `react-native-web` vs **Next.js** nuevo

### 5.1 Estado actual

- **Mobile**: Expo Router + gran cantidad de pantallas RN nativas (`ScrollView`, `StyleSheet`, `Pressable`, Expo Image, QR, etc.).
- **Web producto**: Next.js ya usado para **caseta** (`GuardScanClient`), con `@supabase/supabase-js` en cliente.
- **Web raíz** (`web/app/page.tsx`): plantilla por defecto; no hay portal admin web aún.

### 5.2 Opción A — `react-native-web` + compartir UI con Expo

| Pros | Contras |
|------|---------|
| Reutilizar componentes y lógica de pantallas si el bundle y las dependencias (Expo Image, QR nativo) tienen alternativa web. | Expo + RN-web en monorepo grande suele requerir Metro/Webpack cuidadoso, “platform-specific” para QR, cámara, push. |
| Una sola árbol de componentes para residente “ligero”. | **Roles administrativos** (tablas densas, filtros, formularios complejos, impresión) suelen desarrollarse más rápido en HTML/CSS o librerías web (TanStack Table, shadcn). |

**Viabilidad:** media para **residente simplificado**; baja-media para **todo el admin** sin reescritura masiva.

### 5.3 Opción B — **Next.js** (App Router) para WebApp administrativa y, si aplica, portal residente web

| Pros | Contras |
|------|---------|
| Alineado con **`web/`** ya existente; SSR/SEO si hace falta; ecosistema de UI para dashboards. | Duplicación de algunas reglas de validación respecto a mobile (mitigar con paquete `@ncoto/shared` TS: tipos, Zod, llamadas Supabase). |
| Autorización por rol en **middleware** + layout por segmento (`/app`, `/guardia`, `/admin`, `/partner`). | Dos codebases de UI que hay que mantener en sync funcional. |

**Recomendación de arquitecto:**  
- **Next.js dedicado** (extendiendo `web/`) para **Super Admin, Partner Admin, Admin local**, módulos de **avisos**, reportes y configuración — mismos contratos Supabase (RLS + RPC).  
- Mantener **React Native** para **residente, guardia en campo** (offline, cámara, UX táctil).  
- Opcionalmente, un **portal web residente** en Next.js solo si el negocio lo exige; no es obligatorio portar RN a web.  
- **`react-native-web`**: reservarlo solo si el equipo prioriza **una** base de componentes y acepta el costo de integración; no es el camino más corto para una **WebApp escalable con jerarquías admin** descritas.

---

## 6. Próximos pasos sugeridos (orden lógico)

1. Corregir o crear **`mobile/app/(admin)/announcements.tsx`** (o quitar tab hasta tener feature).
2. Formalizar modelo **Partner** (tablas + `current_user_coto_id` + triggers).
3. Añadir migración **`announcements`** + RLS + hooks desde mobile/Web.
4. Definir enum o columnas para **inquilino/delegado** y plan de migración de datos desde `resident` homogéneo.
5. Estructurar **`web/app/(dashboard)/...`** por rol con layout y guards de sesión Supabase.

---

*Generado a partir del análisis del repositorio NCoto. Actualizar al implementar nuevos roles o rutas.*
