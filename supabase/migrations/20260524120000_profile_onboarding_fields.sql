-- Campos de onboarding residente + nuevos usuarios quedan en pending hasta aprobación del admin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS claimed_house_number text;

COMMENT ON COLUMN public.profiles.full_name IS 'Nombre completo capturado en onboarding.';
COMMENT ON COLUMN public.profiles.phone IS 'Teléfono móvil (WhatsApp) del residente.';
COMMENT ON COLUMN public.profiles.claimed_house_number IS 'Casa declarada al solicitar acceso; se valida al aprobar.';

-- Solicitudes incompletas o sin propiedad → pending (si aún no rechazadas).
UPDATE public.profiles
SET approval_status = 'pending'::public.profile_approval_status
WHERE role = 'resident'::public.user_role
  AND property_id IS NULL
  AND approval_status <> 'rejected'::public.profile_approval_status
  AND (
    claimed_house_number IS NOT NULL AND btrim(claimed_house_number) <> ''
    OR house_number IS NOT NULL AND btrim(house_number) <> ''
  );

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

  INSERT INTO public.profiles (id, coto_id, email, role, approval_status)
  VALUES (
    NEW.id,
    default_coto,
    lower(btrim(NEW.email)),
    'resident'::public.user_role,
    'pending'::public.profile_approval_status
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  RETURN NEW;
END;
$$;
