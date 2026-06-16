-- RBAC: enum user_role en profiles; RLS basada en profiles.role (sin substring en email).

DO $rbac$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('resident', 'guard', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$rbac$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'resident';

COMMENT ON COLUMN public.profiles.role IS 'Rol de aplicación: residente, guardia o administrador del coto.';

-- Quitar dependencias en RLS de visits antes de eliminar el helper JWT (evita error en push remoto).
DROP POLICY IF EXISTS "visits_select_tenant" ON public.visits;
DROP POLICY IF EXISTS "visits_update_tenant" ON public.visits;

-- Sustituir helper basado en JWT por chequeo de rol en BD
DROP FUNCTION IF EXISTS public.jwt_email_contains_guardia();

-- peek_visit_exists_for_security: solo usuarios con rol guard en el mismo coto
CREATE OR REPLACE FUNCTION public.peek_visit_exists_for_security(p_visit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coto uuid;
  v_role public.user_role;
BEGIN
  SELECT p.coto_id, p.role INTO v_coto, v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'guard'::public.user_role THEN
    RAISE EXCEPTION 'Solo personal de seguridad (rol guard) puede usar esta función'
      USING ERRCODE = '42501';
  END IF;

  IF v_coto IS NULL THEN
    RAISE EXCEPTION 'Perfil sin coto asignado'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.visits v
    WHERE v.id = p_visit_id AND v.coto_id = v_coto
  );
END;
$$;

-- RLS visits: guard vía profiles.role
DROP POLICY IF EXISTS "visits_select_tenant" ON public.visits;
DROP POLICY IF EXISTS "visits_insert_tenant" ON public.visits;
DROP POLICY IF EXISTS "visits_update_tenant" ON public.visits;
DROP POLICY IF EXISTS "visits_delete_tenant" ON public.visits;

CREATE POLICY "visits_select_tenant"
  ON public.visits FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      resident_id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'guard'::public.user_role
    )
  );

CREATE POLICY "visits_insert_tenant"
  ON public.visits FOR INSERT
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND resident_id = auth.uid()
  );

CREATE POLICY "visits_update_tenant"
  ON public.visits FOR UPDATE
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      resident_id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'guard'::public.user_role
    )
  )
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND (
      resident_id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'guard'::public.user_role
    )
  );

CREATE POLICY "visits_delete_tenant"
  ON public.visits FOR DELETE
  USING (
    coto_id = public.current_user_coto_id()
    AND resident_id = auth.uid()
  );

-- Perfiles: lectura para el propio usuario o administradores del mismo coto
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_tenant"
  ON public.profiles FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'admin'::public.user_role
    )
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() AND coto_id = public.current_user_coto_id())
  WITH CHECK (id = auth.uid() AND coto_id = public.current_user_coto_id());

CREATE POLICY "profiles_update_by_admin"
  ON public.profiles FOR UPDATE
  USING (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'admin'::public.user_role
  )
  WITH CHECK (coto_id = public.current_user_coto_id());

-- Impedir auto-ascenso de rol: solo admin puede cambiar la columna role
CREATE OR REPLACE FUNCTION public.profiles_enforce_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role
    ) THEN
      RAISE EXCEPTION 'Solo un administrador puede asignar o modificar roles'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_change ON public.profiles;
CREATE TRIGGER trg_profiles_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_enforce_role_change();
