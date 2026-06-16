-- Directorio de vecinos: estado de aprobación, tipo de ocupación y alta de propiedades por admin.

DO $ap$
BEGIN
  CREATE TYPE public.profile_approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$ap$;

DO $ok$
BEGIN
  CREATE TYPE public.occupancy_kind AS ENUM ('owner', 'tenant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$ok$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status public.profile_approval_status NOT NULL DEFAULT 'approved';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS occupancy_kind public.occupancy_kind;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.profiles.approval_status IS 'pending = solicitud de acceso; approved = vecino activo; rejected = solicitud rechazada.';
COMMENT ON COLUMN public.profiles.occupancy_kind IS 'Dueño (owner) o Inquilino (tenant) declarado al registrarse.';
COMMENT ON COLUMN public.profiles.email IS 'Correo denormalizado desde auth.users para listados de admin.';

-- Residentes con casa declarada pero sin propiedad vinculada → pendientes de aprobación.
UPDATE public.profiles
SET approval_status = 'pending'::public.profile_approval_status
WHERE role = 'resident'::public.user_role
  AND property_id IS NULL
  AND house_number IS NOT NULL
  AND btrim(house_number) <> ''
  AND approval_status = 'approved'::public.profile_approval_status;

-- Con propiedad vinculada → aprobados.
UPDATE public.profiles
SET approval_status = 'approved'::public.profile_approval_status
WHERE role = 'resident'::public.user_role
  AND property_id IS NOT NULL
  AND approval_status <> 'rejected'::public.profile_approval_status;

-- Sincronizar email desde auth (una pasada; nuevos usuarios vía trigger abajo).
UPDATE public.profiles p
SET email = lower(btrim(u.email))
FROM auth.users u
WHERE u.id = p.id
  AND u.email IS NOT NULL
  AND (p.email IS NULL OR p.email IS DISTINCT FROM lower(btrim(u.email)));

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  default_coto uuid := '00000000-0000-4000-8000-000000000001'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cotos c WHERE c.id = default_coto) THEN
    RAISE EXCEPTION 'Falta el coto por defecto (00000000-0000-4000-8000-000000000001); créalo antes de registrar usuarios.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, coto_id, email, approval_status)
  VALUES (
    NEW.id,
    default_coto,
    lower(btrim(NEW.email)),
    'approved'::public.profile_approval_status
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  RETURN NEW;
END;
$$;

-- Admin / coto_admin pueden crear propiedad al aprobar vecino si aún no existe la unidad.
DROP POLICY IF EXISTS "properties_insert_admin" ON public.properties;
CREATE POLICY "properties_insert_admin"
  ON public.properties FOR INSERT
  TO authenticated
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );
