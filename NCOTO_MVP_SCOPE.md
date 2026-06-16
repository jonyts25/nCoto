# NCoto — Alcance oficial MVP v1 (comercial)

**Estado:** CONGELADO — fase de cierre MVP.  
**Fecha de congelamiento:** 2026-06-01  
**Regla:** Nada entra al MVP v1 sin aprobación explícita de producto. El código puede existir; lo que no está aquí **no se promete ni se demo como producto**.

Documentos relacionados: `NCOTO_ROADMAP.md`, `NCOTO_DEMO_FLOW.md`, `NCOTO_TECH_STABILIZATION.md`, `NCOTO_POSITIONING.md`, `MVP_VERIFICATION_REPORT.md`.

---

## Qué es NCoto

### Descripción corta

**NCoto** es una plataforma de **control de acceso moderno para fraccionamientos (cotos)**: los residentes generan pases digitales (QR); caseta valida ingreso en web o móvil; la administración opera morosidad y altas desde un solo sistema, con **privacidad por unidad** y **trazabilidad** en base de datos.

### Problema que resuelve

- Casetas saturadas de llamadas, listas en papel y WhatsApp personal del guardia.
- Visitas sin registro confiable ni reglas de vigencia (horario, tipo, mora).
- Morosidad aplicada tarde o de forma inconsistente entre residente y caseta.
- Datos de vecinos expuestos o repartidos en chats/grupos.

### Diferenciador principal

**Mora automática en tiempo real** que bloquea creación de pases y validación en caseta, con **privacidad** (RLS multi-tenant, guardia sin ver teléfonos personales en el flujo core) y **caseta híbrida** (web en mostrador + móvil en campo).

### Objetivo emocional

Que un administrador diga: *“Esto me simplifica la operación y reduce problemas.”*

### Feature WOW (v1)

**“Mora automática que bloquea accesos en tiempo real.”**

---

## Qué incluye el MVP v1

Solo capacidades que **deben demostrarse y sostenerse** en piloto comercial.

### Residente (app móvil)

| Capacidad | Incluido MVP v1 | Notas |
|-----------|-----------------|-------|
| Login / cierre de sesión | ✅ | Email + contraseña (Supabase Auth) |
| Generar pase de visita (QR) | ✅ | Tipos: eventual, frecuente, servicio, paquetería |
| Ver detalle del pase y compartir QR | ✅ | Payload firmado en cliente; vigencia por tipo |
| Historial / reenvío al formulario | ✅ | UX operativa, no “ERP” |
| Bloqueo por mora (UI + servidor) | ✅ | **WOW** — sin crear visitas si `is_delinquent` |
| Ver estado de mora en “Mi casa” | ✅ | Lectura; Realtime si está publicado |
| Registro + solicitud de acceso | ✅ opcional piloto | Onboarding → espera → admin aprueba |
| Perfil / cuenta básica | ✅ | Nombre, casa, coto |

| Capacidad | MVP v1 |
|-----------|--------|
| Subir comprobantes de pago | ❌ Roadmap — ver abajo |
| Tesorería (mesa directiva) | ❌ Roadmap |
| Emergencia con alerta a caseta | ❌ Roadmap |
| Push notifications | ❌ Roadmap |

### Guardia (caseta)

| Capacidad | Incluido MVP v1 | Canal recomendado demo |
|-----------|-----------------|-------------------------|
| Validar QR y registrar ingreso | ✅ | **Web** `/guardia/scan` (lector HID o simulación) |
| Lista “visitas previstas hoy” | ✅ | Web |
| Bloqueo por mora antes de ingreso | ✅ | Web + móvil `(security)/[id]` |
| Edición de placas / nota al confirmar | ✅ | Web |
| Escaneo por cámara (móvil) | ✅ | Secundario en demo; web es más estable |
| Bitácora de visitas usadas/activas | ✅ | Móvil `(security)/logs` — soporte, no protagonista |
| Chat / proxy WhatsApp | ❌ Roadmap | Código parcial; no prometer |

**Principio MVP:** el guardia **no necesita** el teléfono personal del residente para autorizar el acceso en el flujo demo.

### Administrador (app móvil + web morosidad)

| Capacidad | Incluido MVP v1 | Notas |
|-----------|-----------------|-------|
| Panel morosidad por casa (toggle) | ✅ | **WOW** — `(admin)/index` o web `/admin/dashboard` |
| Efecto en residente y caseta en tiempo real | ✅ | Realtime `properties` + RLS |
| Directorio: aprobar / rechazar vecinos | ✅ opcional piloto | Si el coto usa auto-registro |
| Alta de usuarios (guardia, residente) | ✅ opcional | Edge Function `admin-create-user` (desplegada) |
| Selector de coto (superadmin) | ✅ | Solo si el partner opera varios cotos |
| Gestión masiva ERP (cobranza, contabilidad) | ❌ | Fuera de v1 |
| Validación de comprobantes de pago | ❌ Roadmap | Existe en código; congelado comercialmente |
| Publicación de avisos / alertas | ❌ Roadmap | Existe en código; no protagonista v1 |
| Reportes avanzados / analytics | ❌ Roadmap | |

### Plataforma (transversal MVP v1)

| Capacidad | Incluido |
|-----------|----------|
| Multi-tenant por `coto_id` + RLS | ✅ |
| Roles: `resident`, `guard`, `admin`, `coto_admin` | ✅ |
| Auditoría básica vía `visit_access_log` + estado de visita | ✅ |
| Migraciones Supabase aplicadas (13/13 verificadas en remoto enlazado) | ✅ requisito técnico |

---

## Qué NO incluye el MVP v1

Lista explícita — **congeladas temporalmente** (aunque haya código en el repo).

| Feature / módulo | Estado en código | Decisión comercial |
|------------------|------------------|------------------|
| ERP administrativo completo | No existe como producto | **NO MVP** |
| Push notifications avanzadas | Parcial (triggers + cliente token; función no desplegada) | **Roadmap futuro — NO MVP** |
| WhatsApp / bot / proxy chat | Parcial (`bot/`, chat comentado) | **Roadmap futuro — NO MVP** |
| Integraciones Uber / Uber Eats | No existe | **Roadmap futuro — NO MVP** |
| Módulo `deliveries` (entregas) | Solo BD | **Roadmap futuro — NO MVP** |
| Emergencias avanzadas (alerta caseta) | Solo UI placeholder | **Roadmap futuro — NO MVP** |
| Automatizaciones complejas (cron paquetería EOD, etc.) | Bot | **Roadmap futuro — NO MVP** |
| IA | No existe | **Roadmap futuro — NO MVP** |
| Finanzas avanzadas (tesorería, reconciliación, ingreso automático por pago) | Implementado parcial | **Roadmap futuro — NO MVP** |
| Comprobantes de pago + Storage | Implementado | **Roadmap futuro — NO MVP** |
| Avisos / announcements con audiencias | Implementado | **Roadmap futuro — NO MVP** |
| Mesa directiva (`board_member`) + tab Tesorería | Implementado | **Roadmap futuro — NO MVP** |
| Partner Admin multi-coto (rol dedicado) | No existe | **Roadmap futuro — NO MVP** |
| Catálogo editable de proveedores (servicio/paquetería) | Listas fijas en código | **Roadmap futuro — NO MVP** |
| Portal web residente completo | No existe | **Roadmap futuro — NO MVP** |
| Landing web de producto | Plantilla Next default | **NO MVP** (no mostrar `/` en demo) |

---

## Qué hace único a NCoto (mensaje v1)

| Pilar | Qué significa en producto | Evidencia técnica |
|-------|---------------------------|-------------------|
| **Privacidad** | Datos por coto y por unidad; guardia valida pase sin operar WhatsApp del residente en el flujo core | RLS, RPCs `peek_*`, sin listado de teléfonos en caseta web |
| **Menos llamadas en caseta** | Residente envía QR; caseta escanea o usa lista del día | QR + `GuardScanClient` lista hoy |
| **Operación centralizada** | Admin marca mora una vez; reglas aplican en app y caseta | `properties.is_delinquent` + Realtime |
| **Mora en tiempo real** | Bloqueo inmediato crear visita + bloqueo ingreso | RLS `visits_insert` + `peek_visit_resident_is_delinquent` |
| **Caseta híbrida** | Web en escritorio (HID) + app móvil cámara | `web/guardia/scan` + `(security)/` |
| **Trazabilidad** | Ingresos ligados a visita y log | `mark_visit_used`, `visit_access_log` |
| **Guardias sin teléfonos personales** | Flujo oficial = QR / sistema, no “llámame al cel del vecino” | Posicionamiento; chat WA fuera de v1 |

---

## Definición oficial de “MVP terminado”

El MVP v1 se considera **terminado para comercialización piloto** cuando se cumplen **todas** las condiciones siguientes.

### A. Producto (funcional)

- [ ] Un residente **aprobado** crea un pase y muestra QR en móvil.
- [ ] Caseta **web** valida ingreso exitoso con QR o “simular escaneo” desde lista del día.
- [ ] Admin marca una unidad en **mora** y, sin reiniciar apps, el residente **no puede** crear visitas y caseta **no puede** confirmar ingreso.
- [ ] Admin quita mora y el flujo de visita + ingreso vuelve a funcionar.
- [ ] Tres roles demo probados: **resident**, **guard**, **admin** o **coto_admin**.

### B. Estabilidad (técnica mínima)

- [ ] `npm run build` en `web/` sin error.
- [ ] `npx tsc --noEmit` en `mobile/` sin error.
- [ ] Checklist `NCOTO_DEMO_FLOW.md` ejecutada una vez sin fallos bloqueantes.
- [ ] Usuarios y casas seed documentados y repetibles.
- [ ] Variables `EXPO_PUBLIC_*` y `NEXT_PUBLIC_*` configuradas para el mismo proyecto Supabase.

### C. Comercial (go-to-market)

- [ ] Demo de 10 min ensayada (`NCOTO_DEMO_FLOW.md`).
- [ ] Pitch y posicionamiento acordados (`NCOTO_POSITIONING.md`).
- [ ] Alcance congelado comunicado al equipo: **no prometer** ítems de “Qué NO incluye”.

### D. Explícitamente NO requerido para “MVP terminado”

- Push funcionando end-to-end.
- Bot WhatsApp en producción.
- Pagos / tesorería / avisos.
- Emergencia backend.
- CI/CD o cobertura E2E automatizada.

---

## Congelamiento de alcance

| Acción permitida en fase cierre | Acción NO permitida |
|--------------------------------|---------------------|
| Bugfixes en flujos MVP v1 | Nuevas features “porque ya casi está” |
| Seed de datos demo | Refactors arquitectónicos grandes |
| Ocultar / no navegar a tabs fuera de scope | Expandir a ERP, finanzas, push en v1 |
| Estabilización lista en `NCOTO_TECH_STABILIZATION.md` | Nuevas integraciones externas |

**Criterio de prioridad:** ¿Ayuda a que un administrador diga que le simplifica la operación **esta semana**? Si no → roadmap.

---

*Documento maestro de alcance. Cualquier cambio de scope requiere actualizar este archivo y `NCOTO_ROADMAP.md`.*
