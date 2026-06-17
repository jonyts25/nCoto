-- NCoto — Seed demo (MVP v1)
--
-- PROPÓSITO: datos repetibles para demo/piloto en entorno de PRUEBA.
-- NO ejecutar en producción sin revisión explícita.
-- NO crea usuarios en auth.users (Supabase Auth requiere Dashboard o Admin API).
--
-- CÓMO USAR:
--   1. Supabase Dashboard → SQL Editor → ejecutar secciones 1–2.
--   2. Authentication → Users → crear 3 usuarios (Auto Confirm ✅).
--   3. Copiar UUID de cada usuario y completar sección 3.
--   4. Ejecutar verificación sección 4.
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

-- Obtener IDs de propiedades (copiar PROPERTY_ID_CASA_10 para sección 3)
SELECT id, house_number, is_delinquent
FROM public.properties
WHERE coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
ORDER BY house_number;

-- ---------------------------------------------------------------------------
-- 3) Perfiles — PASO MANUAL DESPUÉS DE CREAR USUARIOS EN AUTH
-- ---------------------------------------------------------------------------
-- Crear en Dashboard → Authentication → Users:
--   demo.residente@tudominio.com
--   demo.guardia@tudominio.com
--   demo.admin@tudominio.com
-- Password: definir una contraseña solo para demo (no commitear).
--
-- Reemplazar placeholders:
--   <UID_RESIDENTE>  = uuid Auth del residente
--   <UID_GUARDIA>    = uuid Auth del guardia
--   <UID_ADMIN>      = uuid Auth del admin
--   <PROPERTY_ID_CASA_10> = uuid de properties donde house_number = '10'

/*
UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'resident'::public.user_role,
  property_id = '<PROPERTY_ID_CASA_10>'::uuid,
  house_number = '10',
  display_name = 'Vecino Demo Casa 10',
  full_name = 'Vecino Demo Casa 10',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.residente@tudominio.com'
WHERE id = '<UID_RESIDENTE>'::uuid;

UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'guard'::public.user_role,
  property_id = NULL,
  display_name = 'Guardia Demo',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.guardia@tudominio.com'
WHERE id = '<UID_GUARDIA>'::uuid;

UPDATE public.profiles
SET
  coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  role = 'coto_admin'::public.user_role,
  property_id = NULL,
  display_name = 'Admin Demo',
  approval_status = 'approved'::public.profile_approval_status,
  email = 'demo.admin@tudominio.com'
WHERE id = '<UID_ADMIN>'::uuid;

-- Solo si el admin es rol global 'admin' con varios cotos:
-- UPDATE public.profiles
-- SET active_coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
-- WHERE id = '<UID_ADMIN>'::uuid;
*/

-- ---------------------------------------------------------------------------
-- 4) Verificación
-- ---------------------------------------------------------------------------
SELECT id, email, role, coto_id, property_id, house_number, approval_status
FROM public.profiles
WHERE coto_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
ORDER BY role, email;

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
-- • El coto por defecto 00000000-0000-4000-8000-000000000001 lo crean migraciones
--   para registro self-service; este seed usa un coto DEMO separado.
-- • Si el trigger handle_new_user_profile ya creó profiles al dar de alta Auth,
--   usar UPDATE (sección 3). Si no hay fila, revisar migraciones 20260524*.
-- • Visita de demo opcional: crear desde la app (eventual, hoy) o insert manual
--   en public.visits — preferible crear en app para validar RLS end-to-end.
