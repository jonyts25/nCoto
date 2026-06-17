# NCoto Fase 1.1 — Reporte final de cierre QA

**Fecha:** 2026-06-17  
**Entorno:** Supabase Cloud staging (`qldbilzfnfpesxydlyuc`, us-west-2)  
**Alcance:** entrada/salida (`usage_mode`, `presence`), RPC Fase 1.1, caseta web, guardia mobile  

---

## Resumen ejecutivo

| Área | Resultado |
|------|-----------|
| DB/RPC smoke (previo) | **23/23 PASS** |
| Web caseta (previo) | **25/25 PASS** (`NCOTO_PHASE_1_1_WEB_STAGING_QA_REPORT.md`) |
| Mobile guardia (esta sesión) | **31/31 PASS** (harness API + labels UI) |
| `cd web && npm run build` | **OK** |
| `cd mobile && npm test` | **15/15 PASS** |
| `cd mobile && npx tsc --noEmit` | **OK** |
| Bugfix código | **No requerido** |

### Decisión final

**Fase 1.1 cerrada.**

- **Lista para push a GitHub** (rama `main` +7 commits respecto a `origin/main`).
- **Lista para demo extendida** (web caseta + mobile guardia contra staging).
- **No requiere fix** adicional en DB/RPC, web ni mobile por esta QA.

---

## Commits incluidos en Fase 1.1

| Commit | Descripción |
|--------|-------------|
| `9896596` | `feat(db): Fase 1.1 entrada/salida con RPC y hardening mark_visit_used` |
| `98fd534` | `fix(db): validacion temporal server-side en RPC Fase 1.1` |
| `bb202aa` | `feat(web): caseta Fase 1.1 con entrada/salida via register_visit_access` |
| `fd8876e` | `test(web): QA staging caseta Fase 1.1 entrada salida` |
| `5320e03` | `feat(mobile): guardia Fase 1.1 entrada/salida via register_visit_access` |

Migración aplicada en Cloud: `20260616180000_visit_usage_mode_access_cycles.sql`.

---

## Resultado DB/RPC

Documentado en `NCOTO_PHASE_1_1_CLOUD_TEST_REPORT.md` (2026-06-16).

- Pruebas T1–T12 + extras: **23/23 PASS**
- RPCs: `peek_visit_access_action`, `register_visit_access`
- Sin `db reset`, sin borrado masivo

---

## Resultado web

Documentado en `NCOTO_PHASE_1_1_WEB_STAGING_QA_REPORT.md` (2026-06-17).

- Login guardia demo, single_use, cycle, mora, reasons: **PASS**
- `npm run build`: **OK** (revalidado en cierre)
- Commit UI: `bb202aa`

---

## Resultado mobile guardia

### Configuración staging

| Verificación | Resultado |
|--------------|-----------|
| `mobile/.env` presente (sesión QA, gitignored) | **Sí** — creado para esta sesión |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://qldbilzfnfpesxydlyuc.supabase.co` |
| Project ref | `qldbilzfnfpesxydlyuc` |
| Fallback sin `.env` | `web/.env.local` (mismo proyecto) |

> Cada desarrollador debe tener `mobile/.env` con URL/anon de staging antes de probar en dispositivo.

### Método de prueba

1. **Harness:** `web/scripts/qa_mobile_staging_phase11.mjs` — misma Auth + RPC que `mobile/src/features/visits/repo.ts`, validando labels de `mobile/app/(security)/[id].tsx` (`confirmButtonTitle`, `entryBlockedMessage`, `mapAccessReasonToMessage`, badges `FUERA`/`DENTRO`).
2. **Setup datos:** SQL reutilizado de `supabase/scripts/qa_web_staging_*.sql` (sin reset global, sin borrado masivo).
3. **Login:** `demo.guardia@ncoto.demo` (contraseña runbook demo, no en repo).
4. **Post-QA:** `qa_web_staging_reset.sql` ejecutado para dejar fixtures limpios.

> **Nota:** no se ejecutó pasada visual en dispositivo físico/emulador en esta sesión. El harness cubre paridad funcional RPC + textos UI; se recomienda smoke visual rápido con Expo (`/(security)/{visitId}`) antes de demo en vivo.

### Casos PASS / FAIL

#### 3–4. `single_use` y `cycle`

| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| Botón “Registrar ingreso” | **PASS** | `SU-BTN` |
| Registro + éxito | **PASS** | `SU-REGISTER` |
| Visita `used` | **PASS** | `SU-USED` |
| No repetir ingreso | **PASS** | `SU-NO-REPEAT` |
| Badge FUERA | **PASS** | `CY-FUERA-BADGE` |
| Botón “Registrar entrada” | **PASS** | `CY-ENTRADA-BTN` |
| Entrada OK | **PASS** | `CY-ENTRADA-OK` |
| Badge DENTRO | **PASS** | `CY-DENTRO-BADGE` |
| Botón “Registrar salida” | **PASS** | `CY-SALIDA-BTN` |
| Salida OK | **PASS** | `CY-SALIDA-OK` |
| Vuelve FUERA | **PASS** | `CY-FUERA-FINAL` |

Visitas: `11111111-1111-4111-8111-111111111103` (single_use), `22222222-2222-4222-8222-222222222202` (cycle).

#### 5. Mora

| Caso | Resultado | Evidencia |
|------|-----------|-----------|
| Casa 10 morosa + cycle FUERA → bloquea entrada | **PASS** | `MORA-BLOCK-PEEK`, `MORA-BLOCK-REG` |
| Mensaje UI | **PASS** | `Unidad en mora: no se puede registrar entrada.` |
| Cycle DENTRO + mora → permite salida | **PASS** | `MORA-EXIT-PEEK`, `MORA-EXIT-REG` |
| Restaurar no morosa | **PASS** | `qa_web_staging_mora_off.sql` + reset final |

#### 6. Reasons (mensajes humanos)

| Caso | Resultado | Mensaje |
|------|-----------|---------|
| `pase_vencido` | **PASS** | Pase vencido |
| `fuera_de_dia` | **PASS** | Pase no válido para hoy |
| `fuera_de_horario` | **PASS** | Fuera de horario |

#### Entorno + Auth

| Caso | Resultado |
|------|-----------|
| `ENV-STAGING` → `qldbilzfnfpesxydlyuc` | **PASS** |
| Login `demo.guardia@ncoto.demo` | **PASS** |

**Total mobile harness:** **31/31 PASS** (fases: `core`, `mora-entry`, `mora-exit`, `reason-vencido`, `reason-dia`, `reason-horario`).

---

## Validaciones técnicas (esta sesión)

```powershell
cd d:\Proyectos\nCoto\web
npm run build                    # OK

cd d:\Proyectos\nCoto\mobile
npm test                         # 15/15 PASS
npx tsc --noEmit                 # OK

cd d:\Proyectos\nCoto
git status                       # main ahead 7; solo lockfiles modificados sin stage
```

### QA staging ejecutado

```powershell
npx supabase db query --linked -f supabase/scripts/qa_web_staging_reset.sql

cd web
node scripts/qa_mobile_staging_phase11.mjs core

npx supabase db query --linked -f supabase/scripts/qa_web_staging_mora_on.sql
node scripts/qa_mobile_staging_phase11.mjs mora-entry

npx supabase db query --linked -f supabase/scripts/qa_web_staging_mora_inside.sql
node scripts/qa_mobile_staging_phase11.mjs mora-exit

npx supabase db query --linked -f supabase/scripts/qa_web_staging_mora_off.sql
npx supabase db query --linked -f supabase/scripts/qa_web_staging_reason_vencido.sql
node scripts/qa_mobile_staging_phase11.mjs reason-vencido

npx supabase db query --linked -f supabase/scripts/qa_web_staging_reason_dia.sql
node scripts/qa_mobile_staging_phase11.mjs reason-dia

npx supabase db query --linked -f supabase/scripts/qa_web_staging_reason_horario.sql
node scripts/qa_mobile_staging_phase11.mjs reason-horario

npx supabase db query --linked -f supabase/scripts/qa_web_staging_reset.sql
```

Resultados JSON: `web/scripts/qa_mobile_staging_phase11_*.json` (no commiteados).

---

## Bugs encontrados

| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| — | — | Ninguno en código Fase 1.1 | — |

**Incidencia operativa (conocida, no bloqueante):** usuarios demo insertados por SQL requieren `confirmation_token = ''` para Auth (documentado en QA web). Ya corregido en staging.

**Incidencia de proceso (esta sesión):** ejecutar fases QA mobile sin reset entre SQL de `reason_horario` y `mora` produce falsos FAIL por estado cruzado. Mitigación: orden estricto reset → SQL → harness (documentado arriba).

---

## Fixes aplicados

| Tipo | Archivo | Commiteado |
|------|---------|------------|
| Código web/mobile/DB | — | — |
| `mobile/.env` staging | Creado local, gitignored | No |
| Harness QA mobile | `web/scripts/qa_mobile_staging_phase11.mjs` | No (herramienta local) |

---

## Riesgos pendientes

| Riesgo | Notas |
|--------|--------|
| QA mobile sin dispositivo físico | Harness valida RPC + labels; falta smoke visual Expo recomendado |
| `mobile/.env` por desarrollador | No commiteado; copiar de `.env.example` + credenciales staging |
| Bitácora entry/exit en mobile | **Fuera de Fase 1.1** — `logs.tsx` no distingue entrada/salida |
| TZ navegador/dispositivo vs `America/Mexico_City` | Edge en frontera horaria (documentado) |
| Pases `cycle` vencidos con visitante dentro | Salida permitida; puede no aparecer en listados “hoy” |
| Scripts/reportes QA untracked | Opcional commitear harness SQL en iteración futura |

---

## Fuera de alcance (confirmado)

- Pagos, push, WhatsApp, emergencia
- Módulos Fase 2/3
- Bitácora entry/exit
- Nuevas migraciones / `db reset`
- Cambios en web/mobile salvo bugfix (ninguno necesario)

---

## Conclusión

Fase 1.1 **entrada/salida** validada end-to-end en staging: DB/RPC (23/23), web caseta (25/25), mobile guardia harness (31/31), builds y tests locales OK.

**Siguiente paso sugerido:** `git push origin main` y demo piloto con guardia en dispositivo real.
