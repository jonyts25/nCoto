-- NCoto — Seed demo (MVP v1)
--
-- PROPÓSITO: datos repetibles para demo/piloto en entorno de PRUEBA.
-- NO ejecutar en producción sin revisión explícita.
-- NO crea usuarios en auth.users (Supabase Auth requiere Dashboard o Admin API).
--
-- CÓMO USAR (ver guía completa al final del archivo):
--   A. SQL Editor → secciones 1–2.
--   B. Authentication → 3 usuarios demo (Auto Confirm ✅).
--   C. Descomentar UPDATE sección 5 con UUID reales.
--   D. Verificación sección 6.
--
-- Referencia ampliada: NCOTO_DEMO_SETUP_AND_SCRIPT.md, NCOTO_DEMO_RUNBOOK.md

-- ---------------------------------------------------------------------------
-- Constantes demo (UUID fijo para repetibilidad)
-- ---------------------------------------------------------------------------
-- COTO_DEMO_ID     = aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
-- Casa mora demo   = 10
-- Casa al corriente = 20

-- ---------------------------------------------------------------------------
-- 1) Coto demo
-- ---------------------------------------------------------------------------
INSERT INTO public.cotos (id, name, slug)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  'Fraccionamiento Demo NCoto',
  'demo-ncoto'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug;

-- ---------------------------------------------------------------------------
-- 2) Propiedades (unidades)
-- ---------------------------------------------------------------------------
INSERT INTO public.properties (coto_id, house_number, is_delinquent)
SELECT v.coto_id, v.house_number, v.is_delinquent
FROM (
  VALUES
    ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, '10', false),
    ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, '20', false)
) AS v(coto_id, house_number, is_delinquent)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.properties p
  WHERE p.coto_id = v.coto_id
    AND lower(btrim(p.house_number)) = lower(btrim(v.house_number))
);

-- Obtener IDs de propiedades (copiar PROPERTY_ID_CASA_10 para sección 5)
SELECT id, house_number, is_delinquent
FROM public.properties
WHERE coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
ORDER BY house_number;

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
-- • El coto por defecto 00000000-0000-4000-8000-000000000001 lo crean migraciones
--   para registro self-service; este seed usa un coto DEMO separado.
-- • Si el trigger handle_new_user_profile ya creó profiles al dar de alta Auth,
--   usar UPDATE (sección 3). Si no hay fila, revisar migraciones 20260524*.
-- • Visita de demo opcional: crear desde la app (eventual, hoy) o insert manual
--   en public.visits — preferible crear en app para validar RLS end-to-end.

-- ===========================================================================
-- GUÍA COMPLETA AUTH + PERFILES (único archivo para dejar demo listo)
-- ===========================================================================
--
-- ORDEN DE EJECUCIÓN
--   A. Ejecutar secciones 1–2 (SQL arriba) en SQL Editor.
--   B. Crear usuarios en Authentication (pasos abajo).
--   C. Copiar UUID de Auth + PROPERTY_ID_CASA_10 del SELECT de sección 2.
--   D. Descomentar y ejecutar los UPDATE de abajo (sección 5).
--   E. Ejecutar SELECT de verificación (sección 6).
--
-- ---------------------------------------------------------------------------
-- B) Supabase Dashboard → Authentication → Users → Add user (×3)
-- ---------------------------------------------------------------------------
--
-- Crear EXACTAMENTE estos tres usuarios:
--
--   | Email                         | Rol final en profiles |
--   |-------------------------------|------------------------|
--   | demo.residente@ncoto.demo     | resident               |
--   | demo.guardia@ncoto.demo       | guard                  |
--   | demo.admin@ncoto.demo         | coto_admin             |
--
-- Contraseña sugerida (solo demo / entorno de prueba):
--
--   DemoNCoto2026!
--
--   (Cámbiala si tu política de seguridad lo exige; usa la misma en los 3
--    usuarios para simplificar la presentación.)
--
-- En cada alta, activar:
--
--   [x] Auto Confirm User
--
-- Sin Auto Confirm, el login fallará con email no confirmado.
--
-- Tras crear cada usuario, copiar su UUID (columna id en Authentication).
-- Ese UUID es el id de public.profiles (trigger handle_new_user_profile).
--
-- ---------------------------------------------------------------------------
-- C) Obtener PROPERTY_ID_CASA_10 (si no lo anotaste en sección 2)
-- ---------------------------------------------------------------------------
--
-- SELECT id FROM public.properties
-- WHERE coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
--   AND house_number = '10';
--
-- ---------------------------------------------------------------------------
-- 5) UPDATE profiles — descomentar, reemplazar placeholders, ejecutar
-- ---------------------------------------------------------------------------
--
-- Placeholders:
--   <UID_RESIDENTE>       = UUID Auth de demo.residente@ncoto.demo
--   <UID_GUARDIA>         = UUID Auth de demo.guardia@ncoto.demo
--   <UID_ADMIN>           = UUID Auth de demo.admin@ncoto.demo
--   <PROPERTY_ID_CASA_10> = UUID de properties (Casa 10)

/*
-- RESIDENTE (Casa 10, aprobado, con unidad)
UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'resident'::public.user_role,
  property_id = '<PROPERTY_ID_CASA_10>'::uuid,
  house_number = '10',
  display_name = 'Vecino Demo Casa 10',
  full_name = 'Vecino Demo Casa 10',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.residente@ncoto.demo'
WHERE id = '<UID_RESIDENTE>'::uuid;

-- GUARDIA (mismo coto, sin property_id)
UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'guard'::public.user_role,
  property_id = NULL,
  display_name = 'Guardia Demo',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.guardia@ncoto.demo'
WHERE id = '<UID_GUARDIA>'::uuid;

-- ADMIN LOCAL (coto_admin)
UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'coto_admin'::public.user_role,
  property_id = NULL,
  display_name = 'Admin Demo',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.admin@ncoto.demo'
WHERE id = '<UID_ADMIN>'::uuid;
*/

-- ---------------------------------------------------------------------------
-- 6) Verificación final (debe devolver 3 filas)
-- ---------------------------------------------------------------------------
--
-- SELECT id, email, role, coto_id, property_id, house_number, approval_status
-- FROM public.profiles
-- WHERE coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
-- ORDER BY role, email;
--
-- Esperado:
--   resident   | demo.residente@ncoto.demo | property_id NOT NULL | approved
--   guard      | demo.guardia@ncoto.demo   | property_id NULL     | approved
--   coto_admin | demo.admin@ncoto.demo     | property_id NULL     | approved
--
-- ---------------------------------------------------------------------------
-- Login de prueba (app móvil + web caseta)
-- ---------------------------------------------------------------------------
--
--   Residente: demo.residente@ncoto.demo / DemoNCoto2026!
--   Guardia:   demo.guardia@ncoto.demo   / DemoNCoto2026!  → web /guardia/scan
--   Admin:     demo.admin@ncoto.demo      / DemoNCoto2026!  → Panel morosidad
