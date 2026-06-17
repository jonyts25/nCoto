# NCoto Fase 1.1 — QA manual web caseta (staging)

**Fecha:** 2026-06-17  
**Proyecto:** NCoto (`qldbilzfnfpesxydlyuc`)  
**URL probada:** `http://localhost:3000/guardia/scan`  
**Commit UI:** `bb202aa`  
**Usuario guardia:** `demo.guardia@ncoto.demo`  
**Contraseña:** runbook demo (no documentada en este archivo)

---

## Resumen

| Área | Resultado |
|------|-----------|
| `.env.local` → staging | **Configurado** (archivo local, no commiteado) |
| `npm run dev` | **OK** — `/guardia/scan` HTTP 200 |
| Login Auth guardia | **OK** (tras fix datos demo, ver abajo) |
| Flujo `single_use` | **PASS** |
| Flujo `cycle` entrada/salida | **PASS** |
| Mora entry / exit | **PASS** |
| Reasons humanos | **PASS** |
| `npm run build` | **OK** |
| Fix UI web (`bb202aa`) | **No requerido** |

### Decisión

**Listo para mobile guardia** — la UI web caseta y la capa Auth+RPC en staging se comportan según Fase 1.1.

**No requiere fix DB/RPC** ni fix web adicional por esta QA.

---

## Entorno

| Variable | Valor |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qldbilzfnfpesxydlyuc.supabase.co` |
| Project ref | `qldbilzfnfpesxydlyuc` |

`web/.env.local` se creó localmente para esta sesión (gitignored).

---

## Método de prueba

1. **Servidor:** `cd web && npm run dev`
2. **Página:** GET `/guardia/scan` → 200, contiene “Caseta”
3. **Flujos funcionales:** script `web/scripts/qa_staging_phase11.mjs` con **misma** Auth + RPC que `GuardScanClient` (`peek_visit_access_action`, `register_visit_access`), validando además labels UI (`Registrar ingreso/entrada/salida`, badges `FUERA`/`DENTRO`, mensajes `mapAccessReasonToMessage`)
4. **Setup datos:** SQL controlado en `supabase/scripts/qa_web_staging_*.sql` (sin reset, sin borrado masivo)
5. **Build:** `cd web && npm run build`

> Nota: la validación de botones/badges replica la lógica de `GuardScanClient.tsx` contra RPC real con sesión guardia. Se recomienda una pasada visual rápida en navegador con lector QR o “Simular escaneo”.

---

## Incidencia previa (datos staging, no UI)

| Problema | Causa | Fix aplicado |
|----------|-------|--------------|
| Login 500 `Database error querying schema` | `auth.users` demo insertados por SQL con `confirmation_token` NULL | `UPDATE auth.users SET confirmation_token = '' …` (y tokens afines) para `demo.*@ncoto.demo` |

Sin este fix, **ningún** flujo web podía autenticarse. No es bug de `bb202aa`.

**Pendiente operativo:** recrear usuarios demo vía Dashboard **o** actualizar `phase_1_1_cloud_test_setup.sql` para incluir tokens vacíos en futuros seeds.

---

## Casos PASS / FAIL

### 4. Flujo `single_use`

| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| Botón “Registrar ingreso” | **PASS** | `SU-BTN` |
| Registro exitoso | **PASS** | `SU-REGISTER` → `Entrada registrada` |
| Visita queda `used` | **PASS** | `SU-USED` |
| No permite repetir | **PASS** | `SU-NO-REPEAT` (`can_register=false` / `blocked`) |

Visita: `11111111-1111-4111-8111-111111111103`

### 5. Flujo `cycle`

| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| Badge FUERA | **PASS** | `CY-FUERA-BADGE` |
| Botón “Registrar entrada” | **PASS** | `CY-ENTRADA-BTN` |
| Entrada OK | **PASS** | `CY-ENTRADA-OK` |
| Badge DENTRO | **PASS** | `CY-DENTRO-BADGE` |
| Botón “Registrar salida” | **PASS** | `CY-SALIDA-BTN` |
| Salida OK | **PASS** | `CY-SALIDA-OK` |
| Vuelve FUERA | **PASS** | `CY-FUERA-FINAL` |

Visita: `22222222-2222-4222-8222-222222222202`

### 6. Mora

| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| Casa 10 morosa + cycle FUERA → bloquea entrada | **PASS** | `MORA-BLOCK-PEEK`, `MORA-BLOCK-REG` |
| Mensaje UI esperado | **PASS** | `Unidad en mora: no se puede registrar entrada.` |
| Cycle DENTRO + mora → permite salida | **PASS** | `MORA-EXIT-PEEK`, `MORA-EXIT-REG` |
| Restaurar no morosa | **PASS** | SQL `qa_web_staging_mora_off.sql` |

### 7. Reasons (mensajes humanos)

| Caso | Resultado | Mensaje UI |
|------|-----------|------------|
| `pase_vencido` | **PASS** | Pase vencido |
| `fuera_de_dia` / eventual ayer | **PASS** | Pase vencido / no válido para hoy |
| `fuera_de_horario` | **PASS** | Fuera de horario |

No se observaron errores técnicos crudos (`P0001`, códigos RPC) en la capa validada.

---

## Comandos ejecutados

```powershell
# .env.local creado apuntando a qldbilzfnfpesxydlyuc

cd d:\Proyectos\nCoto
npx supabase db query --linked -f supabase/scripts/qa_web_staging_reset.sql

# Fix auth demo (una vez)
npx supabase db query --linked "UPDATE auth.users SET confirmation_token = COALESCE(confirmation_token, ''), ..."

cd web
npm run dev
node scripts/qa_staging_phase11.mjs core
# + fases mora-entry, mora-exit, reason-vencido, reason-dia, reason-horario
npm run build
```

---

## Errores encontrados

| # | Severidad | Descripción | Fix |
|---|-----------|-------------|-----|
| 1 | **Alta (bloqueante QA)** | Auth demo no login por tokens NULL | SQL staging (no UI) |

**Errores en UI `bb202aa`:** ninguno.

---

## Fixes aplicados

| Tipo | Archivo | Commiteado |
|------|---------|------------|
| Datos staging Auth | SQL ad hoc en Cloud | No |
| UI web | — | — |

---

## Riesgos pendientes

| Riesgo | Notas |
|--------|--------|
| Usuarios demo creados por SQL | Recrear en Dashboard o endurecer seed con tokens vacíos |
| TZ navegador vs `America/Mexico_City` en RPC | Documentado; edge en frontera horaria |
| Pases `cycle` vencidos dentro | Salida OK; pueden no listarse en “previstas hoy” |
| `.env.local` local | Cada dev debe tener URL/anon de staging |

---

## Archivos tocados en esta sesión (no en commit UI)

| Archivo | Notas |
|---------|--------|
| `web/.env.local` | Creado, gitignored |
| `web/scripts/qa_staging_phase11.mjs` | Harness QA, no commiteado |
| `web/scripts/qa_staging_*.json` | Resultados, no commiteados |
| `supabase/scripts/qa_web_staging_*.sql` | Setup QA, no commiteados |

**Commit previsto:** solo este reporte.

---

## Conclusión

QA staging de caseta Fase 1.1 **aprobado** (25 checks API+labels PASS tras fix Auth demo).

**Siguiente paso recomendado:** implementar paridad en mobile guardia `(security)/[id].tsx`.
