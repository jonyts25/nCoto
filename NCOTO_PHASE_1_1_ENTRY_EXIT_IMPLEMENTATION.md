# NCoto Fase 1.1 — Entrada / salida (implementación DB/RPC)

**Estado:** migración local creada, **no aplicada en remoto**.  
**Archivo:** `supabase/migrations/20260616180000_visit_usage_mode_access_cycles.sql`  
**UI:** pendiente (web/mobile siguen usando `mark_visit_used`).

---

## Resumen

Fase 1.1 introduce **ciclos entrada/salida** para pases `cycle` (`frecuente`, `servicio`) manteniendo **one-shot** para `eventual` y `paqueteria`. La lógica vive en RPCs `SECURITY DEFINER` con `FOR UPDATE`, `auth.uid()` y endurecimiento de `mark_visit_used`.

### Promesa de negocio

| Modo | Comportamiento |
|------|----------------|
| `single_use` | Un escaneo → entrada → `status = used` |
| `cycle` + `outside` | Escaneo → **entrada** → `presence = inside` |
| `cycle` + `inside` | Escaneo → **salida** → `presence = outside` |
| Mora | Bloquea **solo entrada**; **salida siempre permitida** |
| v1.1 | **No** salida manual sin entrada previa |

---

## Objetos creados / modificados

### Enums

| Enum | Valores |
|------|---------|
| `visit_usage_mode` | `single_use`, `cycle` |
| `visit_presence` | `outside`, `inside` |
| `visit_access_event` | `entry`, `exit` |

### Columnas `visits`

| Columna | Tipo | Notas |
|---------|------|-------|
| `usage_mode` | `visit_usage_mode NOT NULL DEFAULT 'single_use'` | Backfill por `visit_type` |
| `presence` | `visit_presence` | Solo `cycle`; default `outside` |

### Columnas `visit_access_log`

| Columna | Tipo |
|---------|------|
| `event_type` | `visit_access_event` (legacy → `entry`) |
| `guard_id` | `uuid → profiles.id` |

### RPCs públicas

| Función | Propósito |
|---------|-----------|
| `register_visit_access(p_visit_id, p_plates?, p_note?)` | Registro atómico entrada/salida → `jsonb` |
| `peek_visit_access_action(p_visit_id)` | Preview para UI futura |
| `mark_visit_used(visit_id)` | Compat v1; auth + delegación |

### Helpers internos (sin GRANT)

- `_visit_resident_is_delinquent(uuid)`
- `_visit_access_caller_context()`
- `_assert_visit_access_caller(uuid)`

### Triggers

| Trigger | Efecto |
|---------|--------|
| `trg_visits_protect_access_state` | Bloquea UPDATE directo de `usage_mode` / `presence` (salvo flag RPC) |
| `trg_visits_set_default_usage_mode` | INSERT: `frecuente`/`servicio` → `cycle` + `outside` |

### RLS `visit_access_log`

- **Staff** (`guard`, `admin`, `coto_admin`): SELECT logs del coto operativo.
- **Residente**: SELECT solo logs de visitas donde `visits.resident_id = auth.uid()`.
- **REVOKE** INSERT/UPDATE/DELETE a `authenticated` y `anon` (escritura solo vía RPC).

---

## Autorización (quién puede registrar)

`_assert_visit_access_caller` permite:

| Rol | Coto comparado |
|-----|----------------|
| `guard` | `profiles.coto_id` (físico) = `visits.coto_id` |
| `coto_admin` | `profiles.coto_id` = `visits.coto_id` |
| `admin` | `COALESCE(active_coto_id, coto_id)` = `visits.coto_id` |

**No permitido:** `resident`, `board_member`, sin sesión, otro coto.

---

## Compatibilidad `mark_visit_used` (clientes v1)

Hasta que web/mobile usen `register_visit_access`:

1. Valida sesión + rol + coto (ya no es abierta a cualquier `authenticated`).
2. Si `usage_mode = cycle` **y** `presence = inside` → **no** alterna a salida; replica v1 frecuente (`last_access_at` + log `entry` compat).
3. En cualquier otro caso → delega en `register_visit_access`.

Esto evita que un guardia con cliente v1 “saque” a alguien al re-escanear un pase frecuente ya dentro.

---

## Respuestas JSON

### `register_visit_access` (éxito)

```json
{
  "ok": true,
  "action": "entry",
  "presence": "inside",
  "visit_id": "uuid"
}
```

`presence` es `null` tras `single_use` (one-shot).

### `peek_visit_access_action`

```json
{
  "action": "entry",
  "usage_mode": "cycle",
  "presence": "outside",
  "is_delinquent": false,
  "can_register": true,
  "reason": null
}
```

`action` puede ser `entry`, `exit` o `blocked`.

---

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| **Migración no aplicada en remoto** | — | Solo archivo local; no `db push` |
| **Clientes v1 + cycle inside** | Media | Rama compat en `mark_visit_used` |
| **Backfill `presence = outside`** | Baja | Visitas ya “dentro” en la realidad no se infieren; primer escaneo post-migración = entrada |
| **`peek_visit_resident_is_delinquent` solo guard** | Baja | UI v1 sigue usándola; Fase 1.1 UI usará `peek_visit_access_action` |
| **Trigger + RPC** | Baja | Flag `ncoto.allow_access_state_update` en transacción RPC |
| **Admin superadmin sin `active_coto_id`** | Media | Debe seleccionar coto antes de operar caseta |
| **Tests sin JWT** | Media | Pruebas manuales requieren sesión Auth o `supabase start` local |

---

## SQL manual de pruebas

**Requisitos:** entorno local (`supabase start`) o proyecto de **prueba** (nunca producción).  
Las RPC usan `auth.uid()` — en SQL Editor puro **no hay JWT**; usar una de:

- **A)** App / PostgREST con login guardia/residente.
- **B)** Local: `psql` con `SET request.jwt.claim.sub = '<uuid-perfil>';` (Supabase local).
- **C)** Dashboard → SQL como `service_role` solo para **setup**, luego probar vía API.

### Setup común (service_role / SQL Editor)

```sql
-- IDs de ejemplo; sustituir por los de tu seed demo.
-- COTO: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
-- Guard:  <UID_GUARDIA>
-- Resident: <UID_RESIDENTE>  property_id → Casa 10

-- Visita single_use (eventual)
INSERT INTO public.visits (
  id, coto_id, resident_id, guest_name, status, visit_type,
  valid_day, valid_until, usage_mode
) VALUES (
  '11111111-1111-4111-8111-111111111101'::uuid,
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  '<UID_RESIDENTE>'::uuid,
  'Test Eventual', 'active', 'eventual',
  current_date, (current_date + 1)::timestamptz, 'single_use'
) ON CONFLICT (id) DO NOTHING;

-- Visita cycle (servicio)
INSERT INTO public.visits (
  id, coto_id, resident_id, guest_name, status, visit_type,
  valid_day, valid_until, usage_mode, presence
) VALUES (
  '22222222-2222-4222-8222-222222222202'::uuid,
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  '<UID_RESIDENTE>'::uuid,
  'Test Servicio', 'active', 'servicio',
  current_date, (current_date + 1)::timestamptz, 'cycle', 'outside'
) ON CONFLICT (id) DO NOTHING;
```

---

### 1) single_use entra y queda `used`

**Pre:** visita eventual `active`, mora `false`.

```sql
-- Como guardia (JWT sub = UID_GUARDIA):
SELECT public.register_visit_access(
  '11111111-1111-4111-8111-111111111101'::uuid,
  'ABC-123',
  'nota test'
);
-- Esperado: {"ok":true,"action":"entry","presence":null,"visit_id":"..."}

SELECT status, usage_mode, presence
FROM public.visits
WHERE id = '11111111-1111-4111-8111-111111111101'::uuid;
-- Esperado: status = 'used', presence NULL

SELECT event_type, guard_id, detail
FROM public.visit_access_log
WHERE visit_id = '11111111-1111-4111-8111-111111111101'::uuid
ORDER BY created_at DESC LIMIT 1;
-- Esperado: event_type = 'entry', guard_id = UID_GUARDIA
```

---

### 2) cycle `outside` → entry → `inside`

```sql
SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: action = 'entry', presence = 'inside'

SELECT presence, status, last_access_at IS NOT NULL AS tiene_last_access
FROM public.visits
WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;
-- Esperado: presence = 'inside', status = 'active', tiene_last_access = true
```

---

### 3) cycle `inside` → exit → `outside`

**Pre:** misma visita con `presence = 'inside'` (tras test 2).

```sql
SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: action = 'exit', presence = 'outside'

SELECT presence, status FROM public.visits
WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;
-- Esperado: presence = 'outside', status = 'active'
```

---

### 4) Mora bloquea entry

```sql
UPDATE public.properties
SET is_delinquent = true
WHERE id = (SELECT property_id FROM public.profiles WHERE id = '<UID_RESIDENTE>'::uuid);

-- Reset visita cycle a outside
UPDATE public.visits
SET presence = 'outside', status = 'active'
WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;
-- (usar set_config si el trigger bloquea: en service_role el trigger aún aplica;
--  hacer UPDATE presence vía register_visit_access salida previa, o temporalmente
--  PERFORM set_config('ncoto.allow_access_state_update','1',true) en la misma sesión)

SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: ERROR 'Ingreso bloqueado: unidad en mora'

SELECT public.peek_visit_access_action(
  '22222222-2222-4222-8222-222222222202'::uuid
);
-- Esperado: action = 'entry', can_register = false, is_delinquent = true

-- Limpieza
UPDATE public.properties SET is_delinquent = false WHERE ...;
```

**Nota setup mora:** para resetear `presence` en pruebas con service_role:

```sql
SELECT set_config('ncoto.allow_access_state_update', '1', true);
UPDATE public.visits SET presence = 'outside' WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;
```

---

### 5) Mora permite exit

**Pre:** mora `true`, visita cycle `presence = 'inside'`.

```sql
UPDATE public.properties SET is_delinquent = true WHERE ...;

SELECT set_config('ncoto.allow_access_state_update', '1', true);
UPDATE public.visits
SET presence = 'inside', status = 'active'
WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;

-- Como guardia:
SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: OK, action = 'exit', presence = 'outside'

SELECT public.peek_visit_access_action(
  '22222222-2222-4222-8222-222222222202'::uuid
);
-- Con mora y outside: can_register = false (entrada bloqueada)
```

---

### 6) Usuario no guard no puede registrar

```sql
-- JWT sub = UID_RESIDENTE (rol resident):
SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: ERROR 'Sin permiso para registrar acceso en caseta' (42501)

SELECT public.mark_visit_used('22222222-2222-4222-8222-222222222202'::uuid);
-- Esperado: mismo error
```

---

### 7) Guard de otro coto no puede registrar

```sql
-- JWT sub = guardia de OTRO coto:
SELECT public.register_visit_access(
  '22222222-2222-4222-8222-222222222202'::uuid, NULL, NULL
);
-- Esperado: ERROR 'La visita no pertenece al coto operativo del usuario' (42501)
```

---

### Extra: `mark_visit_used` compat cycle+inside

```sql
-- Visita frecuente/cycle ya inside:
SELECT public.mark_visit_used('22222222-2222-4222-8222-222222222202'::uuid);
-- Esperado: NO cambia presence a outside; actualiza last_access_at; log entry compat
```

---

### Extra: trigger protege `presence`

```sql
-- Como residente (JWT resident):
UPDATE public.visits SET presence = 'inside'
WHERE id = '22222222-2222-4222-8222-222222222202'::uuid;
-- Esperado: ERROR 'usage_mode y presence solo se actualizan vía registro de acceso'
```

---

## Próximos pasos (fuera de este commit)

1. Aplicar migración en entorno de prueba local (`supabase migration up` local).
2. Web: `peek_visit_access_action` + `register_visit_access` en `GuardScanClient`.
3. Mobile: paridad en `(security)/[id].tsx`.
4. Bitácora: leer `visit_access_log` con `event_type`.
5. Retirar rama compat `mark_visit_used` cuando todos los clientes usen entrada/salida explícita.

---

## Validación local realizada

- Migración SQL revisada estáticamente (sin `db push` / `db reset` remoto).
- `npm test` mobile (tests existentes QR/validación — sin cambio de contrato TS en este paso).

---

*No aplicar en producción sin smoke test de los 7 casos anteriores en entorno de prueba.*
