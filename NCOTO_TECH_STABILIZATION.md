# NCoto — Estabilización técnica pre-demo (sin refactors)

**Objetivo:** demo funcional y repetible para MVP v1 comercial.  
**Fuera de alcance:** reescrituras, nueva arquitectura, features nuevas.  
**Base:** `MVP_VERIFICATION_REPORT.md` (verificaciones ya ejecutadas).

---

## Estado verificado (no repetir trabajo)

| Check | Resultado |
|-------|-----------|
| `tsc` mobile / bot | ✅ |
| `next build` web | ✅ |
| `vitest` mobile (15 tests) | ✅ |
| `expo lint` | ✅ 0 errors |
| Migraciones remotas 13/13 | ✅ CLI |
| Edge `admin-create-user` | ✅ desplegada |
| Edge `push-notifications` | ❌ no desplegada |

---

## 1. Crítico — antes de cualquier demo real

Debe estar verde **100%** antes de mostrar a un administrador.

| # | Tarea | Por qué | Cómo validar | Esfuerzo |
|---|--------|---------|---------------|----------|
| C1 | **Seed datos demo** repetibles | Sin perfiles/propiedades la demo se cae | 3 logins OK; 2 casas en panel admin | 1–2 h |
| C2 | **Smoke test manual** guión `NCOTO_DEMO_FLOW.md` | Única prueba E2E real | Checklist completa sin bloqueos | 2–3 h |
| C3 | **Mismo Supabase** en mobile + web `.env` | Auth/RLS inconsistentes si no | Login mismo proyecto en ambos | 15 min |
| C4 | **Caseta web** `/guardia/scan` en laptop demo | Flujo protagonista | Simular escaneo + ingreso OK | 30 min |
| C5 | **Mora E2E** admin → residente → caseta | WOW principal | Toggle mora; bloqueo crear visita + modal caseta | 30 min |
| C6 | Confirmar **Realtime** `properties` en proyecto remoto | Sin esto mora “tarda” en residente | Dashboard Supabase → Realtime publication incluye `properties` | 15 min |
| C7 | Visitante demo con visita **activa hoy** | Lista “previstas hoy” + QR | Visita en lista antes de abrir caseta | 10 min |

**No requiere código** salvo seed SQL/manual en Supabase.

---

## 2. Importante — antes de partnership / segunda demo

| # | Tarea | Por qué | Validación |
|---|--------|---------|------------|
| I1 | Corregir `mobile/.env.example` (solo placeholder anon) | Evitar filtrar secrets a nuevos devs | Revisión archivo sin `sb_secret_*` |
| I2 | Añadir `web/.env.example` con `NEXT_PUBLIC_*` | Onboarding web demo | Copiar y build OK |
| I3 | `web/app/page.tsx` — links a `/guardia/scan` y `/admin/dashboard` | No abrir `/` por error en demo | Clic navega OK — **cambio mínimo cuando aprueben** |
| I4 | Documentar usuarios demo (email/rol) en runbook interno | Cada presentador usa mismas cuentas | 1 página interna |
| I5 | Probar **Expo en dispositivo físico** (no solo emulador) | Cámara QR residente | Crear visita + ver QR |
| I6 | Verificar bucket `payment-proofs` solo si se activa pagos | Fuera MVP v1 — skip | N/A v1 |
| I7 | Segunda cuenta guardia + admin backup | Contingencia login | Login alternativo OK |

---

## 3. Puede esperar (post-demo / Fase 2)

| Ítem | Motivo |
|------|--------|
| Deploy `push-notifications` + `push_edge_config` | Fuera MVP v1 comercial |
| Bot WhatsApp + `guard-reply` en chat | Fuera MVP v1 |
| Backend emergencia | Placeholder UI; no mostrar |
| CI/CD pipeline | No bloquea demo |
| E2E automatizado (Detox/Playwright) | Vitest unitario suficiente por ahora |
| Limpiar `(tabs)/` legacy | No está en flujo demo |
| Paridad “lista hoy” en app guardia móvil | Web es canal oficial demo |
| Warnings ESLint hooks (`scopeVersion`) | No rompen runtime |
| `crypto.randomUUID` en pagos | Módulo congelado v1 |

---

## 4. Features a ocultar temporalmente (comunicación + navegación)

No es obligatorio borrar código; **sí evitar** en demo y en materiales.

| UI | Ruta / tab | Etiqueta |
|----|------------|----------|
| Pagos residente | `(resident)/payments` | Roadmap Fase 3 — NO MVP |
| Tesorería | `(resident)/treasury` | Roadmap Fase 3 — NO MVP |
| Pagos admin | `(admin)/pending_payments` | Roadmap Fase 3 — NO MVP |
| Alertas | `(admin)/announcements` | Roadmap Fase 2 — NO MVP |
| Chat guardia | `(security)/chat` | Roadmap Fase 2 — NO MVP |
| Emergencia long-press | `(resident)/index` | Roadmap Fase 2 — **no pulsar en demo** |
| Landing web | `/` | No usar |
| Mesa tesorería web | `/mesa/tesoreria` | Roadmap Fase 3 — NO MVP |

**Opcional futuro (cambio mínimo, no ahora):** ocultar tabs con `href: null` en layouts admin/resident — solo si el equipo pide reducir clics accidentales.

---

## 5. Runtime tests que faltan

| Test | Tipo | Prioridad | Estado |
|------|------|-----------|--------|
| Login → crear visita → QR | Manual E2E | P0 | ⚠️ Pendiente confirmación en dispositivo |
| Web caseta simular escaneo → `mark_visit_used` | Manual E2E | P0 | ⚠️ Pendiente |
| Toggle mora → bloqueo residente + caseta | Manual E2E | P0 | ⚠️ Pendiente |
| Registro → onboarding → approve directorio | Manual E2E | P1 | ⚠️ Pendiente |
| Alta usuario Edge Function | Manual E2E | P1 | Función desplegada; falta probar invoke |
| Escaneo cámara guardia móvil | Manual E2E | P2 | Opcional v1 |
| Subida comprobante Storage | Manual E2E | — | Fuera v1 |
| Push recibido en dispositivo | Manual E2E | — | Fuera v1 |
| Bot mensaje WhatsApp | Manual E2E | — | Fuera v1 |
| Carga 10+ visitas lista hoy | Manual stress | P3 | Nice-to-have |

**Automatizado existente:** 15 tests unitarios (QR + validación temporal) — mantener en CI local pre-demo: `cd mobile && npm test`.

---

## 6. Riesgos técnicos conocidos (modo estricto)

| Riesgo | Severidad demo | Mitigación sin refactor |
|--------|----------------|-------------------------|
| `push-notifications` no desplegada | Ninguna si no se muestra push | No mencionar |
| Chat bot comentado | Ninguna si no se abre chat | No navegar a chat |
| Emergencia sin backend | Alta si se pulsa botón | No demostrar; decir roadmap |
| Realtime no publicado | Media en WOW mora | Verificar C6; refresh manual narrado |
| Coto seed `00000000-...` ausente | Alta en registro nuevo | Crear coto en SQL antes de piloto |
| `mobile/.env.example` mal etiquetado | Baja en demo; alta en seguridad | I1 |
| Superadmin sin `active_coto_id` | Media panel vacío | Seleccionar coto antes de demo |
| Residente sin `property_id` | Alta en mora por unidad | Vincular en approve directorio |

---

## 7. Orden de ejecución recomendado (1 día)

```
Mañana:  C1 seed → C3 env → C4 web caseta → C5 mora
Tarde:   C2 smoke test completo (guión 10 min) × 2 repeticiones
Opcional: I5 dispositivo físico + I4 runbook
```

---

## 8. Definición “listo para demo”

- [ ] Críticos C1–C7 verificados
- [ ] `NCOTO_DEMO_FLOW.md` ensayado al menos 1 vez
- [ ] Equipo alineado: no mostrar tablas sección 4
- [ ] Contingencia Plan B documentada (QR precreado, simular escaneo)

---

## 9. Qué NO hacer en esta fase

- Refactor `directory.tsx` / `GuardScanClient` por tamaño
- Unificar validación mobile/web en paquete shared
- Implementar push/bot/emergencia “rápido” para impresionar
- Prometer pagos/tesorería porque ya compila

---

*Actualizar tras cada demo real con incidencias (fecha, qué falló, fix aplicado).*
