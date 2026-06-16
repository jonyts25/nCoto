-- Superadmin: active_coto_id para filtrar tenant; rol coto_admin; políticas y función de tenant efectivo.

DO $e$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'coto_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$e$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_coto_id uuid REFERENCES public.cotos (id);

COMMENT ON COLUMN public.profiles.active_coto_id IS 'Solo role=admin (superadmin): coto activo para consultas RLS; si NULL se usa coto_id.';

-- Tenant efectivo: superadmin usa COALESCE(active_coto_id, coto_id); resto usa coto_id físico.
CREATE OR REPLACE FUNCTION public.current_user_coto_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT CASE
    WHEN p.role = 'admin'::public.user_role THEN COALESCE(p.active_coto_id, p.coto_id)
    ELSE p.coto_id
  END
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

-- peek: el guardia sigue filtrando por coto físico del perfil (no active_coto_id)
CREATE OR REPLACE FUNCTION public.peek_visit_exists_for_security(p_visit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phys_coto uuid;
  v_role public.user_role;
BEGIN
  SELECT p.coto_id, p.role INTO v_phys_coto, v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'guard'::public.user_role THEN
    RAISE EXCEPTION 'Solo personal de seguridad (rol guard) puede usar esta función'
      USING ERRCODE = '42501';
  END IF;

  IF v_phys_coto IS NULL THEN
    RAISE EXCEPTION 'Perfil sin coto asignado' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.visits v
    WHERE v.id = p_visit_id AND v.coto_id = v_phys_coto
  );
END;
$$;

-- Perfiles: lectura para usuarios del mismo tenant efectivo
DROP POLICY IF EXISTS "profiles_select_tenant" ON public.profiles;

CREATE POLICY "profiles_select_tenant"
  ON public.profiles FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
        'admin'::public.user_role,
        'coto_admin'::public.user_role,
        'resident'::public.user_role
      )
    )
  );

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_by_admin" ON public.profiles;

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_by_admin"
  ON public.profiles FOR UPDATE
  USING (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  )
  WITH CHECK (coto_id = public.current_user_coto_id());

-- Cotos: superadmin ve todos; resto solo su tenant efectivo
DROP POLICY IF EXISTS "cotos_select_same_tenant" ON public.cotos;

CREATE POLICY "cotos_select"
  ON public.cotos FOR SELECT
  USING (
    id = public.current_user_coto_id()
    OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'admin'::public.user_role
  );

-- Trigger: coto_admin no puede asignar admin/coto_admin; solo superadmin (admin) asigna esos roles
CREATE OR REPLACE FUNCTION public.profiles_enforce_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  caller public.user_role;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    SELECT p.role INTO caller FROM public.profiles p WHERE p.id = auth.uid();
    IF caller IS NULL THEN
      RAISE EXCEPTION 'Sin perfil' USING ERRCODE = '42501';
    END IF;

    IF caller = 'coto_admin'::public.user_role THEN
      IF NEW.role IN ('admin'::public.user_role, 'coto_admin'::public.user_role) THEN
        RAISE EXCEPTION 'Un administrador de coto no puede asignar roles de administrador'
          USING ERRCODE = '42501';
      END IF;
    ELSIF caller = 'resident'::public.user_role THEN
      RAISE EXCEPTION 'Los residentes no pueden cambiar roles' USING ERRCODE = '42501';
    ELSIF caller NOT IN ('admin'::public.user_role, 'coto_admin'::public.user_role) THEN
      RAISE EXCEPTION 'Sin permiso para cambiar roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_enforce_active_coto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  caller_role public.user_role;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.active_coto_id IS DISTINCT FROM NEW.active_coto_id THEN
    SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid();
    IF caller_role IS DISTINCT FROM 'admin'::public.user_role THEN
      RAISE EXCEPTION 'Solo el superadministrador puede cambiar el coto activo' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_active_coto ON public.profiles;
CREATE TRIGGER trg_profiles_active_coto
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_enforce_active_coto();
