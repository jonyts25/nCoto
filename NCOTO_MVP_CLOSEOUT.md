# NCoto — Cierre MVP v1 (demo / piloto)

**Fecha de cierre:** 2026-06-16  
**Estado:** MVP v1 cerrado para **demo y piloto acotado** — sin expansión de features.  
**Promesa:** *La caseta ejecuta reglas del coto sin depender del WhatsApp del administrador.*

Documentos operativos: `NCOTO_DEMO_RUNBOOK.md`, `NCOTO_MVP_SCOPE.md`, `supabase/seed-demo.sql`.

---

## Alcance final v1

### Incluido (compromiso comercial piloto)

| Área | Capacidades |
|------|-------------|
| **Residente** | Login, crear pase QR (tipos core), ver QR, historial básico, bloqueo por mora, perfil / Mi casa |
| **Caseta** | Validar QR, lista del día, bloqueo mora, placas/nota, bitácora |
| **Administración** | Toggle mora por casa, directorio aprobación (opcional piloto), alta usuarios (opcional piloto) |
| **Plataforma** | Multi-tenant `coto_id`, RLS, roles core, auditoría vía `visit_access_log` + estado visita |
| **Web operativa** | Landing `/`, `/guardia/scan`, `/admin/dashboard` |

### Explícitamente fuera de v1

| Módulo | Fase | Estado en repo |
|--------|------|----------------|
| Pagos / comprobantes | 3 | Código existe; **navegación oculta** |
| Tesorería / `board_member` | 3 | Código existe; **navegación oculta** |
| Alertas / announcements | 2 | Código existe; **tab oculta** |
| Chat / bot WhatsApp | 2 | Parcial; chat sin URL bot |
| Push notifications | 2 | Triggers + cliente; función no desplegada |
| Emergencia backend | 2 | Solo UI |
| Portal residente web | — | No existe |
| ERP / cobranza / IA | 3+ | No existe |

---

## Features congeladas

Regla hasta cerrar piloto v1:

| Permitido | No permitido |
|-----------|--------------|
| Bugfixes en flujos v1 | Nuevas features “casi listas” |
| Seed / runbook / copy demo | Refactors grandes |
| Ocultar navegación Fase 2/3 | Prometer módulos congelados |
| Documentación de cierre | Migraciones remotas sin aprobación |

**Código no borrado:** rutas Fase 2/3 siguen en el repo con `href: null` en tabs móviles; landing web sin enlace a tesorería.

---

## Cambios aplicados en este cierre (código)

| Cambio | Archivo |
|--------|---------|
| Ocultar tabs Pagos, Tesorería, Usuarios (residente) | `mobile/app/(resident)/_layout.tsx` |
| Ocultar tabs Alertas, Pagos admin | `mobile/app/(admin)/_layout.tsx` |
| Chat guardia ya oculto (`href: null`) | `mobile/app/(security)/_layout.tsx` |
| Landing operativa mínima | `web/app/page.tsx` |
| Seed demo propuesto (no ejecutado) | `supabase/seed-demo.sql` |
| Runbook demo | `NCOTO_DEMO_RUNBOOK.md` |

---

## Riesgos pendientes

| Riesgo | Severidad | Mitigación actual |
|--------|-----------|-------------------|
| Sin smoke test E2E documentado en dispositivo | Alta | Ejecutar checklist `NCOTO_DEMO_RUNBOOK.md` |
| Realtime `properties` no verificado en remoto | Media | Plan B refresh en runbook |
| Seed manual (Auth fuera de SQL) | Media | `seed-demo.sql` + pasos Dashboard |
| Sin CI/CD | Media | `npm test` + build local pre-demo |
| Push / bot visibles en código pero rotos | Baja | Tabs ocultas + guión “no demostrar” |
| `PRODUCT_STATUS_MVP.md` desactualizado | Baja | Usar este doc + `MVP_ARCHITECTURE_AUDIT.md` |
| Dependencia config `.env` × 3 apps | Alta | Checklist pre-demo |
| Emergencia accesible en Inicio residente | Media | **No pulsar** en demo |

---

## Checklist — declarar piloto listo

Marcar **todos** antes de firmar piloto comercial:

### Producto

- [ ] Residente aprobado crea pase y muestra QR
- [ ] Caseta web valida ingreso (escaneo o simular)
- [ ] Admin marca mora → residente no crea visitas + caseta bloquea
- [ ] Admin quita mora → flujo normal restaurado
- [ ] Roles demo probados: resident, guard, admin/coto_admin
- [ ] Guión 7 min ensayado (`NCOTO_DEMO_RUNBOOK.md`)

### Técnico

- [ ] Migraciones aplicadas en proyecto piloto (13/13)
- [ ] `admin-create-user` desplegada (si se usa alta en demo)
- [ ] `mobile/.env` + `web/.env.local` mismo Supabase
- [ ] `npm run build` web OK
- [ ] `npm test` mobile OK (15 tests QR/validación)
- [ ] Seed demo aplicado o equivalente documentado
- [ ] Realtime verificado **o** Plan B acordado con cliente

### Comercial

- [ ] Alcance v1 comunicado por escrito (este doc + `NCOTO_MVP_SCOPE.md`)
- [ ] Cliente entiende: **no** ERP, **no** pagos v1
- [ ] Contacto soporte / escalación definido para piloto

### Explícitamente NO requerido para “piloto listo”

- Push end-to-end
- Bot WhatsApp producción
- Pagos / tesorería / avisos operativos
- Emergencia backend
- CI/CD o E2E automatizado

---

## Próximos pasos después del cierre

Orden sugerido **post-piloto v1** (Fase 2+):

| Prioridad | Paso |
|-----------|------|
| 1 | Ejecutar piloto real + retro documentada (métricas: visitas/día, mora aplicada) |
| 2 | Smoke test E2E manual archivado (pass/fail por flujo) |
| 3 | CI mínimo: mobile test + web build |
| 4 | Verificar Realtime + runbook actualizado |
| 5 | Decidir promoción comercial Fase 2 (push **o** WhatsApp — no ambos a la vez sin capacidad ops) |
| 6 | Archivar o banner en docs obsoletos (`PRODUCT_STATUS_MVP.md`, `MVP_STATUS.md`) |

---

## Definición de “hecho” para este cierre de repo

- [x] Navegación v1 sin tabs Fase 2/3 en flujo principal
- [x] Landing web operativa
- [x] Runbook demo 7 min + planes B
- [x] Documento de cierre MVP
- [x] Seed demo propuesto (`supabase/seed-demo.sql`)
- [ ] Smoke test en dispositivo (operación — fuera de commit)
- [ ] Checklist piloto listo marcado en entorno real

---

*Cualquier cambio de alcance v1 requiere actualizar `NCOTO_MVP_SCOPE.md` y este documento.*
