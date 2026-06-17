# NCoto — Runbook de demo / piloto (MVP v1)

**Versión:** cierre MVP v1 — demo y piloto acotado  
**Promesa comercial:** *La caseta ejecuta reglas del coto sin depender del WhatsApp del administrador.*  
**Documentos relacionados:** `NCOTO_MVP_CLOSEOUT.md`, `NCOTO_MVP_SCOPE.md`, `NCOTO_DEMO_SETUP_AND_SCRIPT.md`, `supabase/seed-demo.sql`

---

## Promesa del MVP

nCoto v1 **no es un ERP vecinal**. Es control de acceso operativo:

- El **residente** genera un pase QR con reglas de vigencia.
- La **caseta** valida el ingreso (web o móvil) con trazabilidad.
- El **administrador** marca o quita mora por unidad.
- La **mora** bloquea nuevos pases y el ingreso en caseta **al instante** (con Realtime activo).
- La **bitácora** deja evidencia de accesos.

---

## Qué SÍ se demuestra

| # | Capacidad | Canal recomendado |
|---|-----------|-------------------|
| 1 | Login por rol (residente, guardia, admin) | Móvil + web |
| 2 | Crear pase QR (tipo eventual, hoy) | Móvil residente |
| 3 | Validar ingreso / rechazar por mora o horario | **Web** `/guardia/scan` |
| 4 | Lista “Visitas previstas hoy” + simular escaneo | Web caseta |
| 5 | Marcar / quitar mora por casa | Móvil admin **Panel** o web `/admin/dashboard` |
| 6 | Bloqueo residente (no crear visitas) tras mora | Móvil residente |
| 7 | Bitácora de ingresos | Móvil guardia → **Bitácora** (opcional, 30 s) |
| 8 | Directorio: aprobar vecino (stretch) | Móvil admin → **Residentes** |
| 9 | Alta de usuario guardia (stretch) | Móvil admin → **Usuarios** |

---

## Qué NO se demuestra

No abrir ni prometer en la presentación:

| Módulo | Motivo |
|--------|--------|
| Pagos / comprobantes | Fase 3 — tab oculta en app |
| Tesorería / mesa directiva | Fase 3 |
| Alertas / announcements | Fase 2 — sin push end-to-end |
| Chat guardia / WhatsApp | Fase 2 — bot no operativo |
| Bot WhatsApp / proxy | Fase 2 |
| Push notifications | Fase 2 — Edge Function no desplegada |
| Emergencia (long-press) | Fase 2 — solo UI local |
| Portal web residente | No existe |
| `/mesa/tesoreria` | Fase 3 — no enlazado en landing |

**Frase si preguntan:** *“Está en roadmap; el piloto v1 se centra en acceso, caseta y mora.”*

---

## Usuarios demo necesarios

Mínimo **3 cuentas** en Supabase Auth + filas en `profiles`:

| Cuenta sugerida | Rol `profiles.role` | Requisitos |
|-----------------|---------------------|------------|
| `demo.residente@tudominio.com` | `resident` | `coto_id` demo, `property_id` Casa 10, `approval_status = approved` |
| `demo.guardia@tudominio.com` | `guard` | Mismo `coto_id`, sin `property_id` |
| `demo.admin@tudominio.com` | `coto_admin` (o `admin`) | Mismo `coto_id`; si `admin` global, fijar `active_coto_id` |

**Datos en BD (además de usuarios):**

- 1 coto demo (ver `supabase/seed-demo.sql` o `NCOTO_DEMO_SETUP_AND_SCRIPT.md`)
- Al menos 2 casas en `properties` (ej. Casa 10 y Casa 20), `is_delinquent = false` al inicio
- 1 visita **eventual** con `validDay` = **hoy** (opcional backup si falla creación en vivo)

**Seed existente en repo:**

| Recurso | Uso |
|---------|-----|
| `supabase/seed-demo.sql` | SQL idempotente para coto + casas (no crea Auth) |
| `NCOTO_DEMO_SETUP_AND_SCRIPT.md` | Guía paso a paso Auth + perfiles + guión extendido |
| Coto por defecto `00000000-0000-4000-8000-000000000001` | Registro self-service; **no** sustituye coto demo de presentación |

**Cómo correr el seed (solo entorno de prueba / SQL Editor):**

1. Revisar el archivo `supabase/seed-demo.sql` (no ejecutar en producción sin revisión).
2. Supabase Dashboard → **SQL Editor** → pegar y ejecutar la sección de coto + propiedades.
3. Crear usuarios en **Authentication → Users** (Auto Confirm ✅).
4. Ejecutar los `UPDATE profiles` del mismo archivo con los UUID de Auth.
5. Verificar con el `SELECT` final del seed.

---

## Guión de demo — 7 minutos

### 0:00–0:45 — Contexto (verbal)

> “NCoto digitaliza el acceso: el vecino genera un pase, caseta valida con reglas del coto, y la administración controla mora en tiempo real — sin depender del WhatsApp del administrador.”

### 0:45–2:15 — Residente: pase QR (móvil)

1. Login `demo.residente@...`
2. **Inicio** → mostrar estado al corriente
3. **Visitas** → crear visita **eventual** (visitante “Juan Pérez”, hoy)
4. Abrir detalle → **mostrar QR**

*Decir:* “El vecino comparte el QR como quiera; caseta no necesita su teléfono.”

**No pulsar:** Emergencia (long-press).

### 2:15–4:15 — Caseta: ingreso (web — protagonista)

1. Laptop → `/guardia/scan` (o desde `/` → enlace Caseta)
2. Login `demo.guardia@...`
3. Señalar **Visitas previstas hoy**
4. **Simular escaneo** o escanear QR → confirmar ingreso

*Decir:* “Un flujo, trazabilidad, menos llamadas en caseta.”

### 4:15–6:00 — WOW mora (admin + caseta + residente)

1. Login admin → **Panel** → activar mora en **Casa 10**
2. Residente (sin cerrar app): banner de adeudo; **Visitas** bloqueado
3. Caseta: reintentar ingreso del mismo pase → **bloqueo por mora**
4. Admin: quitar mora → residente puede crear visita de nuevo

*Decir:* “Un clic de mora; las reglas aplican en app y caseta.”

### 6:00–7:00 — Cierre

- Opcional 20 s: guardia → **Bitácora** (evidencia)
- Cierre: *“Piloto v1: acceso, caseta y mora. Comunicación y finanzas en fases siguientes.”*

---

## Checklist pre-demo (15 min antes)

### Entorno

- [ ] `mobile/.env` y `web/.env.local` → **mismo** proyecto Supabase (URL + anon key)
- [ ] `cd web && npm run dev` → `/` muestra landing nCoto con enlaces
- [ ] `cd mobile && npx expo start` → app carga en dispositivo demo
- [ ] Reloj del sistema = **fecha de hoy** (afecta `validDay`)

### Datos

- [ ] Login residente → llega a Inicio (no “Esperando aprobación”)
- [ ] Login guardia web → `/guardia/scan` operativo
- [ ] Login admin → Panel lista **Casa 10** (y Casa 20 si aplica)
- [ ] `properties.is_delinquent = false` en Casa demo al inicio
- [ ] Visita de hoy creada **o** lista para crear en vivo

### UX v1 (tabs ocultas)

- [ ] Residente: solo tabs **Inicio**, **Visitas**, **Mi Casa**
- [ ] Admin: solo **Panel**, **Residentes**, **Usuarios**
- [ ] Guardia: **Escanear**, **Bitácora** (sin Chat)

### Ensayo

- [ ] Correr guión 7 min una vez en seco
- [ ] Plan B impreso o en segunda pestaña (abajo)

---

## Plan B — si Realtime falla

**Síntoma:** Admin marca mora pero el residente no ve el banner al instante.

| Paso | Acción |
|------|--------|
| 1 | Narrar: *“En producción usamos actualización en vivo; refrescamos para continuar.”* |
| 2 | Residente: pull-to-refresh o cerrar y reabrir app / cambiar de tab |
| 3 | Verificar en Supabase Dashboard → **Database → Replication** que `properties` esté en publicación `supabase_realtime` |
| 4 | Si persiste: admin quita y vuelve a poner mora mientras residente refresca |

**Demo sigue válida** si el bloqueo en **caseta web** funciona (RPC `peek_visit_resident_is_delinquent` no depende de Realtime en el cliente residente).

---

## Plan B — si escaneo QR falla

**Síntoma:** Lector USB no escribe, cámara no lee, o QR no decodifica.

| Paso | Acción |
|------|--------|
| 1 | Usar **Simular escaneo** en la fila de “Visitas previstas hoy” (web) |
| 2 | Tener visita **ya creada** antes de la demo (misma pantalla, menos riesgo) |
| 3 | Copiar `visitId` desde Supabase (`visits` table) si hace falta depurar |
| 4 | Fallback móvil guardia: `(security)` → escanear con cámara (secundario) |
| 5 | Último recurso: mostrar solo flujo **mora** (toggle admin + bloqueo en simular escaneo) |

---

## Contingencia rápida

| Problema | Acción |
|----------|--------|
| Login falla | Verificar `.env`; usuario Auto Confirm en Auth |
| “Perfil no encontrado” | Completar fila `profiles` con seed |
| Guardia no ve visita | Mismo `coto_id` que residente |
| Superadmin panel vacío | Seleccionar coto activo (`SuperCotoSelector`) |
| Build web roto | `cd web && npm install && npm run build` |

---

*Actualizar tras cada demo real: fecha, incidencias, ajustes al seed o guión.*
