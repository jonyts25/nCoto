-- NCoto — Multi-tenancy: cotos, profiles (coto_id NOT NULL), columnas tenant, RLS por coto.
-- Ejecutar después de las migraciones base. Revisar y ajustar el "coto" por defecto antes de producción.

-- ---------------------------------------------------------------------------
-- 1) Tabla raíz de tenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cotos IS 'Fraccionamiento / tenant. Todas las filas de negocio deben referenciar coto_id.';

-- Un registro para backfill y nuevos usuarios hasta onboarding multi-coto real
INSERT INTO public.cotos (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Coto por defecto',
  'default'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Perfiles: coto_id obligatorio (FK a cotos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE RESTRICT,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfil de app: un usuario pertenece a exactamente un coto.';
COMMENT ON COLUMN public.profiles.coto_id IS 'Obligatorio: aislamiento multi-tenant.';

CREATE INDEX IF NOT EXISTS idx_profiles_coto_id ON public.profiles (coto_id);

-- Si la tabla ya existía sin NOT NULL, forzar tras backfill manual:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'coto_id' AND is_nullable = 'YES'
  ) THEN
    UPDATE public.profiles SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN coto_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND coto_id = public.current_user_coto_id()
  );

-- Sin INSERT para anon/authenticated: el alta va por trigger (handle_new_user) o service_role.

-- ---------------------------------------------------------------------------
-- 3) Columnas coto_id en tablas de negocio (denormalizado donde simplifica RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.package_followup_prompts ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.proxy_sessions ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.proxy_messages ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.visit_access_log ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);

UPDATE public.visits SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.residents SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.deliveries SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.logs SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.package_followup_prompts SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.proxy_sessions SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.proxy_messages SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;
UPDATE public.visit_access_log SET coto_id = '00000000-0000-4000-8000-000000000001' WHERE coto_id IS NULL;

ALTER TABLE public.visits ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.residents ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.deliveries ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.logs ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.package_followup_prompts ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.proxy_sessions ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.proxy_messages ALTER COLUMN coto_id SET NOT NULL;
ALTER TABLE public.visit_access_log ALTER COLUMN coto_id SET NOT NULL;

-- house_number único por coto (no global)
ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_house_number_key;
DROP INDEX IF EXISTS residents_house_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS residents_coto_house_unique ON public.residents (coto_id, house_number);

CREATE INDEX IF NOT EXISTS idx_visits_coto_id ON public.visits (coto_id);
CREATE INDEX IF NOT EXISTS idx_residents_coto_id ON public.residents (coto_id);

-- ---------------------------------------------------------------------------
-- 4) Helpers para RLS (no usar user_metadata editable para autorización)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_coto_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.coto_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.jwt_email_contains_guardia()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT position('guardia' IN lower(coalesce(auth.jwt() ->> 'email', ''))) > 0
$$;

COMMENT ON FUNCTION public.current_user_coto_id() IS 'coto del perfil del usuario autenticado; NULL si no hay fila en profiles.';

-- ---------------------------------------------------------------------------
-- 5) Trigger: perfil al registrar usuario en auth.users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_coto uuid;
BEGIN
  SELECT id INTO default_coto FROM public.cotos ORDER BY created_at LIMIT 1;
  IF default_coto IS NULL THEN
    RAISE EXCEPTION 'No hay cotos configurados; crea al menos uno antes de registrar usuarios.';
  END IF;
  INSERT INTO public.profiles (id, coto_id)
  VALUES (NEW.id, default_coto)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profiles ON auth.users;
CREATE TRIGGER on_auth_user_created_profiles
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- ---------------------------------------------------------------------------
-- 6) Trigger: rellenar coto_id en INSERTs desde cliente (anon key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_coto_id_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cid uuid;
BEGIN
  IF NEW.coto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  cid := public.current_user_coto_id();
  IF cid IS NOT NULL THEN
    NEW.coto_id := cid;
  END IF;
  IF NEW.coto_id IS NULL THEN
    RAISE EXCEPTION 'coto_id requerido (definir en inserción con service_role o usuario con perfil)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_coto ON public.visits;
CREATE TRIGGER trg_visits_coto
  BEFORE INSERT ON public.visits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_coto_id_from_profile();

DROP TRIGGER IF EXISTS trg_proxy_sessions_coto ON public.proxy_sessions;
CREATE TRIGGER trg_proxy_sessions_coto
  BEFORE INSERT ON public.proxy_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_coto_id_from_profile();

CREATE OR REPLACE FUNCTION public.set_proxy_message_coto_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    SELECT ps.coto_id INTO NEW.coto_id FROM public.proxy_sessions ps WHERE ps.id = NEW.session_id;
  END IF;
  IF NEW.coto_id IS NULL THEN
    NEW.coto_id := public.current_user_coto_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proxy_messages_coto ON public.proxy_messages;
CREATE TRIGGER trg_proxy_messages_coto
  BEFORE INSERT ON public.proxy_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_proxy_message_coto_from_session();

-- ---------------------------------------------------------------------------
-- 7) mark_visit_used: propagar coto_id al log de acceso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_visit_used(visit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.visits%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  INSERT INTO public.visit_access_log (visit_id, actor, detail, coto_id)
  VALUES (visit_id, 'guard', 'Registro de acceso / ingreso', r.coto_id);

  IF r.visit_type = 'frecuente' THEN
    UPDATE public.visits SET last_access_at = now() WHERE id = visit_id;
  ELSIF r.visit_type = 'paqueteria' THEN
    UPDATE public.visits
    SET ingreso_confirmado_at = now(), status = 'used'
    WHERE id = visit_id;
  ELSE
    UPDATE public.visits SET status = 'used' WHERE id = visit_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) peek_visit_exists_for_security: mismo coto que el guardia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.peek_visit_exists_for_security(p_visit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_coto uuid;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email = '' OR position('guardia' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Solo personal autorizado de seguridad puede usar esta función'
      USING ERRCODE = '42501';
  END IF;
  v_coto := public.current_user_coto_id();
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

-- ---------------------------------------------------------------------------
-- 9) RLS — visits (reemplazar políticas previas)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow full access for service roles" ON public.visits;
DROP POLICY IF EXISTS "Residents can create their own visits" ON public.visits;
DROP POLICY IF EXISTS "Residents can view their own visits" ON public.visits;

CREATE POLICY "visits_select_tenant"
  ON public.visits FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      resident_id = auth.uid()
      OR public.jwt_email_contains_guardia()
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
      OR public.jwt_email_contains_guardia()
    )
  )
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND (
      resident_id = auth.uid()
      OR public.jwt_email_contains_guardia()
    )
  );

CREATE POLICY "visits_delete_tenant"
  ON public.visits FOR DELETE
  USING (
    coto_id = public.current_user_coto_id()
    AND resident_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 10) RLS — resto de tablas con aislamiento por coto_id (patrón global)
-- ---------------------------------------------------------------------------
-- residents: solo lectura en cliente; altas/cambios vía bot (service_role) o admin
DROP POLICY IF EXISTS "residents_tenant_all" ON public.residents;
DROP POLICY IF EXISTS "residents_modify_service_only" ON public.residents;
CREATE POLICY "residents_select_tenant" ON public.residents FOR SELECT
  USING (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "deliveries_tenant" ON public.deliveries;
CREATE POLICY "deliveries_tenant_select" ON public.deliveries FOR SELECT
  USING (coto_id = public.current_user_coto_id());
CREATE POLICY "deliveries_tenant_write" ON public.deliveries FOR INSERT
  WITH CHECK (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "logs_tenant" ON public.logs;
CREATE POLICY "logs_tenant_select" ON public.logs FOR SELECT
  USING (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "pkg_prompts_tenant" ON public.package_followup_prompts;
CREATE POLICY "package_followup_prompts_tenant" ON public.package_followup_prompts FOR SELECT
  USING (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "proxy_sessions_tenant" ON public.proxy_sessions;
CREATE POLICY "proxy_sessions_tenant" ON public.proxy_sessions FOR ALL
  USING (coto_id = public.current_user_coto_id())
  WITH CHECK (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "proxy_messages_tenant" ON public.proxy_messages;
CREATE POLICY "proxy_messages_tenant" ON public.proxy_messages FOR ALL
  USING (coto_id = public.current_user_coto_id())
  WITH CHECK (coto_id = public.current_user_coto_id());

DROP POLICY IF EXISTS "visit_access_log_tenant" ON public.visit_access_log;
CREATE POLICY "visit_access_log_tenant_select" ON public.visit_access_log FOR SELECT
  USING (coto_id = public.current_user_coto_id());

ALTER TABLE public.cotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cotos_select_same_tenant" ON public.cotos FOR SELECT
  USING (id = public.current_user_coto_id());

-- Usuarios ya existentes en auth sin fila en profiles
INSERT INTO public.profiles (id, coto_id)
SELECT u.id, '00000000-0000-4000-8000-000000000001'::uuid
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
