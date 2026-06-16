# NCoto — Estado producto MVP (solo lo implementado en código)

Auditoría **Lead PM + QA**: únicamente comportamiento y archivos **existentes** en el repositorio. No incluye roadmap, SLA comercial ni funciones solo documentadas fuera del código.

**Nota de modelo de datos:** la morosidad en base de datos es el booleano **`public.properties.is_delinquent`**. No aparece en el código analizado un campo `property_status = 'moroso'`; cualquier referencia a “moroso” en producto corresponde a **`is_delinquent === true`**.

---

## Módulo 1: Visitas y accesos (mobile residente / guardia + web caseta)

### Generación de QR y tipos de visita

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Tipos de visita | Enum en payload y formulario: `eventual`, `frecuente`, `servicio`, `paqueteria`. El QR v2 incluye `visitType` y `validDay` opcional. | `mobile/src/features/visits/types.ts`, `mobile/src/features/visits/qr.ts`, `mobile/app/(resident)/visits.tsx` | 100% funcional |
| Codificación QR | JSON del payload → `JSON.stringify` → Base64 (`encode` de `base-64`). Validación con Zod (v1 y v2). | `mobile/src/features/visits/qr.ts` | 100% funcional |
| Proveedores de servicio (lista fija) | Chips desde arreglo constante: Telmex, Total Play, Megacable, CFE, Agua, **Otro**. Si elige “Otro”, texto libre en `customServicio` y se usa como nombre de visitante. | `mobile/app/(resident)/visits.tsx` (`SERVICIO_OPTIONS`) | 100% funcional |
| Paquetería (lista fija) | Igual patrón: Amazon, Mercado Libre, FedEx, Estafeta, DHL, **Otro** + texto libre si aplica. | `mobile/app/(resident)/visits.tsx` (`PAQUET_OPTIONS`) | 100% funcional |
| Catálogo editable por admin | No hay tabla ni API para “proveedores del coto”; las listas son **constantes en código**. El admin **no** puede añadir nombres desde la app para que salgan como chips nuevos. | — | No implementado |
| Alerta al admin por uso repetido de “Otro” | No hay conteo, analytics ni notificación cuando un texto libre se repite. | — | No implementado |
| Vigencia / día del pase | Eventual / servicio / paquetería: día `validDay` y fin de vigencia local vía `endOfLocalDay`. Frecuente: `schedule` semanal, `valid_until` a ~1 año. | `mobile/src/features/visits/repo.ts`, `mobile/src/features/visits/validation.ts` | 100% funcional |

### Flujo guardia al escanear

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Guardia mobile: escaneo | Cámara `CameraView`, al leer QR decodifica payload y navega a `/(security)/{visitId}`. | `mobile/app/(security)/index.tsx`, `mobile/src/features/visits/qr.ts` | 100% funcional |
| Guardia mobile: carga pase | RPC `peek_visit_exists_for_security` + `select` visita; muestra tipo, visitante, día autorizado, estado; **antes de confirmar** aplica `canValidateVisitNow` (fecha/hora/día según tipo). | `mobile/src/features/visits/repo.ts` (`loadVisitForSecurityScreen`), `mobile/app/(security)/[id].tsx`, `mobile/src/features/visits/validation.ts` | 100% funcional |
| Validación fecha/hora | **Eventual / servicio / paquetería:** `validDay` debe ser **hoy** (ISO local). **Frecuente:** debe ser día de semana correcto y hora dentro del slot. **Además:** `status === active` y `validUntil` no pasado. | `mobile/src/features/visits/validation.ts` (`canValidateVisitNow`); duplicado en `web/lib/visits/validation.ts` | 100% funcional |
| Confirmar ingreso (mobile) | Si validación OK → RPC `mark_visit_used`. Mensajes distintos para frecuente / paquetería / resto. **No** se invoca `peek_visit_resident_is_delinquent` en esta pantalla. | `mobile/app/(security)/[id].tsx`, `mobile/src/features/visits/repo.ts` (`markVisitUsed`) | Buggy / riesgo |
| Guardia web: escaneo | Buffer teclado HID + Enter; decodifica mismo formato QR; `loadVisitForSecurityScreen` → `canValidateVisitNow` → `peek_visit_resident_is_delinquent`; si moroso, modal bloqueante; si OK, edición placas/nota y `mark_visit_used`. | `web/components/guardia/GuardScanClient.tsx`, `web/lib/visits/securityRepo.ts`, `web/lib/visits/validation.ts` | 100% funcional (web) |
| Morosidad en caseta mobile vs web | Web **bloquea** ingreso si RPC indica moroso. Mobile **no** comprueba morosidad del titular antes de `mark_visit_used` (divergencia de producto entre canales). | `web/components/guardia/GuardScanClient.tsx` vs `mobile/app/(security)/[id].tsx` | Buggy (inconsistencia entre canales) |

### Lista “esperados hoy” / cotejo por casa / avisos a residentes

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Lista del día (web caseta) | Sección **“Visitas previstas hoy”**: consulta visitas `active`, filtra con `isVisitListedForToday` (misma regla de día que calendario/horario frecuente), ordena por hora. Muestra nombre visitante (`guestName`), tipo, `validDay`, hora fin. Botón **“Simular escaneo”** reusa el flujo de escaneo con ese `visitId`. **No** muestra número de casa / `resident_id` / unidad en el listado UI. | `web/components/guardia/GuardScanClient.tsx`, `web/lib/visits/securityRepo.ts` (`listTodaysVisitsForGuard`), `web/lib/visits/validation.ts` (`isVisitListedForToday`) | 100% funcional (lista + simulación); limitado para “qué casa avisó” |
| Marcar ingresado desde la lista | No hay acción directa “marcar ingresado” en la fila; el guardia usa **Simular escaneo** y luego el flujo de confirmación (o escanea el QR real). | `web/components/guardia/GuardScanClient.tsx` | 100% funcional vía flujo indirecto |
| Notificación automática al residente al registrar ingreso | No hay push ni WhatsApp disparado desde `GuardScanClient` ni desde `markVisitUsed` en el código de app revisado. | — | No implementado |
| Dashboard equivalente en app guardia | Tab **Bitácora** lista visitas `used` o `active` desde `useVisitRepo` (sin filtro “solo hoy” explícito como en web). No es el mismo UX que “previstas hoy” de la web. | `mobile/app/(security)/logs.tsx`, `mobile/src/features/visits/repo.ts` (`useVisitRepo`) | 100% funcional como bitácora; no es paridad con web “hoy” |

---

## Módulo 2: Administración y morosidad (mobile admin / web)

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Flag de morosidad | Persistencia en **`properties.is_delinquent`** (boolean). RPC `current_user_property_is_delinquent()` lee join perfil → propiedad. | `supabase/migrations/20260420120000_properties_backfill_and_delinquency_rls.sql` | 100% funcional (capa datos) |
| Toggle / botón moroso en UI admin | **No** hay pantalla en la app mobile que actualice `is_delinquent` para la unidad. El residente solo **lee** estado en “Mi casa”. Los admin mobile vistos (`(admin)/index`, `directory`) son placeholder o vacíos; no hay formulario de morosidad. | `mobile/app/(resident)/profile.tsx`; ausencia en `mobile/app/(admin)/` | No implementado (solo vía DB/externo) |
| Bloqueo crear visitas (residente) | RLS `INSERT` en `visits` exige `NOT current_user_property_is_delinquent()`. | `supabase/migrations/20260420120000_properties_backfill_and_delinquency_rls.sql` | 100% funcional |
| UI residente: restricción | Home: botón Generar visita deshabilitado + banner; pestaña Visitas redirige a home si moroso; formulario visitas con banner y campos deshabilitados. | `mobile/app/(resident)/index.tsx`, `mobile/app/(resident)/visits.tsx` | 100% funcional |
| Actualización en vivo | Suscripción Realtime a `UPDATE` de `properties` filtrado por `id` de la propiedad del usuario. | `mobile/app/(resident)/index.tsx` | 100% funcional (si Realtime está publicado en el proyecto) |
| Caseta web: bloqueo moroso | RPC `peek_visit_resident_is_delinquent` antes de permitir confirmar ingreso. | `web/components/guardia/GuardScanClient.tsx`, `web/lib/visits/securityRepo.ts` | 100% funcional |
| “Funciones desactivadas” con moroso | En código: **crear nuevas visitas** (RLS + UI); **interacción** con botón Generar visita y formulario; **Mi casa** muestra “Adeudo / restricción”. **Emergencia** en home **no** está anclada a `isDelinquent` (sigue operativa). **Caseta mobile** no aplica chequeo de morosidad al confirmar (ver Módulo 1). | Archivos citados arriba + `mobile/app/(resident)/index.tsx` (`EmergencyConfirmControl`) | Mixto (ver tabla mora mobile) |

---

## Módulo 3: Finanzas y reconciliación

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Carga de comprobantes por residente | No hay pantallas, tablas dedicadas ni endpoints en el árbol de app (`mobile/`, `web/`) bajo búsquedas por términos comprobante / upload / pago / reconciliación. | — | No implementado |
| Reconciliación de pagos | No implementado en código revisado. | — | No implementado |
| Lectura de correos / notificaciones bancarias | No hay workers, webhooks ni integraciones en este repo para ingerir depósitos desde email o push bancario. | — | No implementado |

*(Fuera de alcance de “solo código”: en un diseño posterior se podrían valorar webhooks del banco, SFTP, Open Banking, o bandeja de correo vía Edge Function + parser; hoy **no** hay base en el repositorio.)*

---

## Módulo 4: Super Admin y alcance multi-coto

| Feature | Cómo funciona hoy (lógica) | Ruta del código (archivo) | Estado |
|--------|----------------------------|---------------------------|--------|
| Selector de coto activo | Solo rol **`admin`** (superadmin en UI): `SuperCotoSelector` lista `cotos` y hace `UPDATE profiles SET active_coto_id = …` del usuario actual; `refetchProfile` y `scopeVersion` refrescan datos dependientes del tenant. | `mobile/src/features/profiles/SuperCotoSelector.tsx`, `mobile/src/context/CotoScopeContext.tsx`, `mobile/src/features/auth/useAuth.ts` | 100% funcional |
| Tenant efectivo en BD | `current_user_coto_id()` devuelve `COALESCE(active_coto_id, coto_id)` solo si `role = admin`; en caso contrario usa `coto_id` fijo. Las políticas RLS que usan esta función **cambian de alcance** al cambiar `active_coto_id`; no “mezclan” filas de dos cotos en una misma query: el contexto de lectura/escritura es el **coto efectivo actual**. | `supabase/migrations/20260419120000_superadmin_coto_scope_and_coto_admin.sql` | 100% funcional |
| Guardia y `active_coto_id` | RPC `peek_visit_exists_for_security` / mora caseta usan **`coto_id` físico** del perfil del guardia, no el coto activo del superadmin (comportamiento intencional en migración). | `supabase/migrations/20260419120000_superadmin_coto_scope_and_coto_admin.sql` | 100% funcional |
| “Partner Admin” / admin de admins | **No existe** el rol ni tablas de socio multi-coto en el enum `user_role` ni en pantallas. Solo `admin` y `coto_admin` además de `resident` y `guard`. | `mobile/src/features/visits/types.ts`, migraciones `user_role` | No implementado |
| Pestaña Avisos (admin) | `_layout` de tabs declara pantalla `announcements`, pero **no hay** archivo `announcements.tsx` en `mobile/app/(admin)/`. | `mobile/app/(admin)/_layout.tsx` | Buggy / incompleto (ruta declarada sin pantalla) |
| Panel / directorio admin | Placeholders o vistas mínimas. | `mobile/app/(admin)/index.tsx`, `mobile/app/(admin)/directory.tsx` | Solo UI / vacío |

---

## Resumen QA rápido

- **Paridad caseta:** la web (`GuardScanClient`) es el flujo más completo (lista hoy + morosidad + placas). La app guardia valida ventana de tiempo pero **no** aplica el mismo bloqueo de morosidad que la web antes de `mark_visit_used`.
- **Proveedores:** selección fija + “Otro” con texto libre; sin catálogo administrable ni alertas por repetición.
- **Finanzas / comprobantes / reconciliación:** sin implementación en el código del monorepo auditado.
- **Superadmin:** cambio de coto vía `active_coto_id` es real y basado en RLS; no hay “Partner Admin” en código.

---

*Documento generado por auditoría estática del repositorio. Validar siempre contra el proyecto Supabase desplegado (migraciones aplicadas, Realtime, Edge Functions).*
