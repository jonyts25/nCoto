# NCoto — Flujo de demo comercial (10 minutos)

**Objetivo de la demo:** que el administrador perciba **simplicidad**, **privacidad** y el **WOW de mora automática**.  
**Audiencia:** administrador de coto, director de administradora, operaciones de caseta.  
**Regla:** estabilidad > amplitud. No mostrar módulos fuera de `NCOTO_MVP_SCOPE.md`.

---

## Antes de la demo (preparación)

### Roles y cuentas (3 usuarios mínimo)

| Rol | Uso en demo | Canal |
|-----|-------------|-------|
| **Residente** `resident` | Genera QR | Móvil (Expo) |
| **Guardia** `guard` | Valida ingreso | **Web** laptop en caseta (primario) |
| **Admin** `admin` o `coto_admin` | Marca mora, opcional directorio | Móvil admin o web morosidad |

### Datos demo obligatorios

- [ ] Un **coto** piloto con nombre reconocible (banner opcional).
- [ ] Al menos **2 propiedades** (`properties`): Casa 1 (al corriente), Casa 2 (para mora).
- [ ] Residente A → `property_id` Casa 1, `approval_status = approved`.
- [ ] Residente B → Casa 2 (opcional; o usar mismo residente y cambiar mora en Casa 1).
- [ ] Guardia con `coto_id` = mismo coto que visitas.
- [ ] Admin con acceso al mismo coto (`coto_admin` o `admin` + selector si superadmin).

### Entorno técnico (5 min pre-demo)

- [ ] `mobile/.env` y `web/.env.local` apuntando al **mismo** proyecto Supabase.
- [ ] Web: `npm run dev` → probar login en `/guardia/scan`.
- [ ] Móvil: `npx expo start` → residente y admin en dispositivos o emuladores.
- [ ] Lector QR USB (opcional) o usar **“Simular escaneo”** en web.
- [ ] Cerrar pestañas: Pagos, Tesorería, Alertas, Chat, Emergencia.

### Qué NO preparar / NO mencionar

- Bot WhatsApp, push, comprobantes, tesorería, Uber, IA, ERP.

---

## Guión — 10 minutos (orden exacto)

### Min 0:00–1:00 — Contexto (sin pantalla o slide simple)

**Decir:**

> “NCoto moderniza el acceso a su fraccionamiento: el vecino genera un pase digital, caseta valida con un escaneo, y la administración controla morosidad en tiempo real — sin depender del WhatsApp personal del guardia.”

**No decir:** ERP, pagos, integraciones futuras.

---

### Min 1:00–3:30 — Residente: pase y privacidad (móvil)

| Paso | Pantalla | Acción | Qué explicar |
|------|----------|--------|--------------|
| 1 | `(auth)/login` | Login residente demo | “Cada vecino entra con su cuenta; los datos están aislados por fraccionamiento.” |
| 2 | `(resident)/index` | Mostrar inicio, banner coto | “El vecino ve su estado y genera visitas desde el celular.” |
| 3 | `(resident)/visits` | Crear visita **eventual** (nombre visitante, hoy) | “Tipos: visita eventual, frecuente, servicio, paquetería — reglas de vigencia automáticas.” |
| 4 | `(resident)/visit/[id]` | Mostrar **QR** | “El vecino comparte el QR por WhatsApp si quiere, pero **caseta no necesita el teléfono del vecino** para autorizar.” |

**WOW secundario:** vigencia y tipos sin papel.

**Si falla:** tener visita **ya creada** como backup (misma pantalla QR).

---

### Min 3:30–6:00 — Caseta: ingreso (web — protagonista)

| Paso | Pantalla | Acción | Qué explicar |
|------|----------|--------|--------------|
| 5 | Web `/guardia/scan` | Login **guardia** | “Caseta usa web en mostrador con lector USB o la lista del día.” |
| 6 | Lista “Visitas previstas hoy” | Señalar fila del visitante demo | “El guardia ve lo esperado hoy sin llamar al residente.” |
| 7 | Escanear QR o **Simular escaneo** | Confirmar ingreso, placas si aplica | “Un solo flujo: validar horario, registrar ingreso, trazabilidad en sistema.” |
| 8 | Confirmación éxito | — | “Queda registrado quién entró y cuándo.” |

**Dispositivo recomendado:** laptop + navegador Chrome/Edge a pantalla completa.

**No mostrar:** `(security)/chat`, bitácora larga, app móvil guardia (salvo que web falle).

---

### Min 6:00–8:30 — WOW: mora automática (admin + residente + caseta)

| Paso | Pantalla | Acción | Qué explicar |
|------|----------|--------|--------------|
| 9 | Admin `(admin)/index` **o** web `/admin/dashboard` | Marcar **Casa 1 en mora** (toggle) | “La administración marca mora **una vez**; el sistema aplica reglas en todos lados.” |
| 10 | `(resident)/index` o `visits` | Sin recargar app (Realtime) | “El vecino ve restricción al instante — no puede generar nuevos pases.” |
| 11 | Intentar crear visita | Debe fallar / bloquear UI | “Bloqueo en app y en servidor — no es solo visual.” |
| 12 | Web caseta | Re-escanear **mismo QR** o simular | **Modal bloqueante** por mora | “Caseta **no deja pasar** aunque tengan QR viejo — esto reduce conflictos en la entrada.” |
| 13 | Admin | Quitar mora | “Al regularizar, todo vuelve a fluir sin llamadas a sistemas externos.” |

**Este bloque es el clímax.** dedicar tiempo y pausa para preguntas.

---

### Min 8:30–9:30 — Operación centralizada (opcional según audiencia)

Elegir **solo uno**:

| Opción A — Administradora multi-coto | Opción B — Alta operativa |
|--------------------------------------|---------------------------|
| `SuperCotoSelector` + cambiar coto | `(admin)/directory` aprobar vecino pendiente **o** `(admin)/users` crear guardia |

**Decir (A):** “Una administradora puede operar varios fraccionamientos con contexto claro, sin mezclar datos.”

**Decir (B):** “Altas y aprobaciones sin Excel ni grupos de WhatsApp de guardias.”

**No mostrar:** Pagos, Alertas, Tesorería.

---

### Min 9:30–10:00 — Cierre comercial

**Decir:**

> “Hoy les mostramos el núcleo: acceso digital, caseta híbrida y mora en tiempo real. Lo siguiente en roadmap es comunicación (avisos, WhatsApp controlado) y finanzas — pero el valor inmediato es **menos fricción en caseta y menos problemas por morosos**.”

**Pregunta de cierre:** “¿En su operación hoy cuántas llamadas recibe caseta por visitas y por morosos en la entrada?”

---

## Qué NO mostrar todavía

| Pantalla / módulo | Motivo |
|-------------------|--------|
| `(resident)/payments` | Roadmap Fase 3 |
| `(resident)/treasury` / `/mesa/tesoreria` | Roadmap Fase 3 |
| `(admin)/pending_payments` | Roadmap Fase 3 |
| `(admin)/announcements` | Roadmap Fase 2 |
| `(security)/chat` | WhatsApp incompleto |
| Botón **Emergencia** (long press) | Sin backend; genera expectativa falsa |
| `web/` home `/` | Plantilla Next sin producto |
| `(tabs)/` legacy | Huérfano |
| Bot, push, cron paquetería | Fase 2 |

**Si preguntan por algo congelado:** “Está en roadmap; el piloto arranca con acceso y mora.”

---

## Plan B si algo falla en vivo

| Fallo | Contingencia |
|-------|--------------|
| Expo no conecta | Video corto pregrabado del QR + narrar caseta web |
| Web caseta no carga env | Tener build `npm run build && npm start` previo |
| Realtime no actualiza mora | Pull-to-refresh / reentrar a visitas; narrar “en producción es instantáneo” |
| QR no escanea | **Simular escaneo** desde lista del día (siempre preparar visita en lista) |
| Login guardia falla | Segunda cuenta guardia backup |

---

## Checklist post-demo (interno)

- [ ] ¿Se entendió mora en tiempo real?
- [ ] ¿Preguntaron por WhatsApp/pagos? (anotar para roadmap)
- [ ] ¿Caseta prefiere web o móvil?
- [ ] ¿Cuántos cotos / casas en piloto potencial?

---

## Referencia rápida de URLs y rutas

| Rol | Ruta principal demo |
|-----|---------------------|
| Residente | App → Inicio / Visitas / QR |
| Guardia | `https://<host>/guardia/scan` |
| Admin mora | App → Panel **o** `https://<host>/admin/dashboard` |

---

*Ensayar una vez en seco antes de reunión con administradora. Tiempo objetivo: 9–11 min.*
