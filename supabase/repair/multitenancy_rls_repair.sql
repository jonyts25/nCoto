-- NCoto — Reparación multi-tenant / RLS (idempotente)
-- Ejecutar en SQL Editor de Supabase cuando haya fallos por políticas duplicadas (42710),
-- dumps que re-ejecutan ADD CONSTRAINT PRIMARY KEY (42P16), o estado parcial de migraciones.
--
-- Qué hace:
-- 1) Elimina TODAS las políticas RLS listadas en pg_policies para tablas clave (evita nombres huérfanos).
-- 2) Garantiza cotos + fila default con UUID fijo.
-- 3) Garantiza profiles + columnas mínimas (rol, coto_id, active_coto_id) y enum user_role con valores usados.
-- 4) Añade coto_id a tablas de negocio, backfill al coto default, NOT NULL cuando aplique.
-- 5) Añade PRIMARY KEY solo si la tabla aún no tiene ninguna PK (evita "multiple primary keys").
-- 6) Funciones/triggers alineados con el repo (current_user_coto_id superadmin, peek por rol guard, mark_visit_used con coto_id).
-- 7) Recrea políticas RLS coherentes con supabase/migrations (RBAC + superadmin).
--    Tras la reparación, si aplicas la migración de morosidad (current_user_property_is_delinquent),
--    sustituye visits_insert_tenant por la versión que incluye NOT public.current_user_property_is_delinquent().
--
-- Coto por defecto (NO usar ORDER BY created_at LIMIT 1 en triggers de alta):
--   00000000-0000-4000-8000-000000000001
--
-- Nota: service_role en Supabase ignora RLS; no se recrea la política "Allow full access for service roles" en visits.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Enum user_role + valores extendidos (idempotente)
-- ---------------------------------------------------------------------------
DO $rbac$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('resident', 'guard', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$rbac$;

DO $v1$
BEGIN
  ALTER TYPE public.user_role ADD VALUE 'coto_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$v1$;

DO $v2$
BEGIN
  ALTER TYPE public.user_role ADD VALUE 'board_member';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$v2$;

-- ---------------------------------------------------------------------------
-- 2) Tabla cotos + fila default
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cotos IS 'Fraccionamiento / tenant. Filas de negocio referencian coto_id.';

INSERT INTO public.cotos (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Coto por defecto',
  'default'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) profiles mínimo + columnas usadas por RLS / superadmin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE RESTRICT,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'resident'::public.user_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_coto_id uuid REFERENCES public.cotos (id);

COMMENT ON COLUMN public.profiles.active_coto_id IS 'Solo role=admin (superadmin): coto activo para consultas RLS; si NULL se usa coto_id.';

CREATE INDEX IF NOT EXISTS idx_profiles_coto_id ON public.profiles (coto_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'coto_id'
      AND is_nullable = 'YES'
  ) THEN
    UPDATE public.profiles
    SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid
    WHERE coto_id IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN coto_id SET NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Limpieza de políticas RLS (todas las de cada tabla; evita 42710 al re-ejecutar)
--    Tablas: las que pediste + las que este script vuelve a crear (cotos, logs, proxies, etc.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (
        ARRAY[
          'visits',
          'profiles',
          'residents',
          'deliveries',
          'cotos',
          'logs',
          'package_followup_prompts',
          'proxy_sessions',
          'proxy_messages',
          'visit_access_log'
        ]::text[]
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Tablas de negocio: IF NOT EXISTS + coto_id + backfill + NOT NULL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.residents (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  house_number text NOT NULL,
  phone_number text NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  role text NOT NULL DEFAULT 'Inquilino'::text
);

CREATE TABLE IF NOT EXISTS public.visits (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  guest_name text NOT NULL,
  house_number text,
  status text DEFAULT 'active'::text,
  created_at timestamptz DEFAULT now(),
  valid_until timestamptz,
  plates text,
  note text,
  resident_id uuid,
  visit_type text NOT NULL DEFAULT 'eventual'::text,
  schedule jsonb,
  valid_day date,
  ingreso_confirmado_at timestamptz,
  last_access_at timestamptz,
  package_followup_sent_at timestamptz,
  tenant_package_received boolean
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  resident_id uuid,
  provider text NOT NULL,
  expected_date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending'::text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.logs (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  visit_id uuid,
  message text NOT NULL,
  guard_id uuid
);

CREATE TABLE IF NOT EXISTS public.package_followup_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL,
  resident_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  outcome text
);

CREATE TABLE IF NOT EXISTS public.proxy_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guard_id uuid,
  resident_id uuid,
  resident_phone text NOT NULL,
  status text DEFAULT 'active'::text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proxy_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  sender text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visit_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'guard'::text,
  detail text
);

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.package_followup_prompts ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.proxy_sessions ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.proxy_messages ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);
ALTER TABLE public.visit_access_log ADD COLUMN IF NOT EXISTS coto_id uuid REFERENCES public.cotos (id);

UPDATE public.visits SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.residents SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.deliveries SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.logs SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.package_followup_prompts SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.proxy_sessions SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.proxy_messages SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;
UPDATE public.visit_access_log SET coto_id = '00000000-0000-4000-8000-000000000001'::uuid WHERE coto_id IS NULL;

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
-- 6) PRIMARY KEY: solo si la tabla no tiene ninguna PK (evita 42P16 al re-ejecutar dumps)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'deliveries',
    'logs',
    'package_followup_prompts',
    'proxy_messages',
    'proxy_sessions',
    'residents',
    'visits',
    'visit_access_log'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public'
        AND r.relname = t
        AND c.contype = 'p'
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I_pkey PRIMARY KEY (id)',
      t,
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7) Helpers y triggers
-- ---------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.current_user_coto_id() IS
  'Tenant efectivo (coto) del usuario. Superadmin usa active_coto_id si está definido.';

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

CREATE OR REPLACE FUNCTION public.set_coto_id_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
    RAISE EXCEPTION 'coto_id requerido (definir en inserción con service_role o usuario con perfil)'
      USING ERRCODE = 'P0001';
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
SET search_path TO public
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

CREATE OR REPLACE FUNCTION public.mark_visit_used(visit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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

CREATE OR REPLACE FUNCTION public.profiles_enforce_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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

-- ---------------------------------------------------------------------------
-- 8) RLS: habilitar y recrear políticas
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_followup_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotos ENABLE ROW LEVEL SECURITY;

-- visits (RBAC: rol guard)
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

-- profiles (superadmin + coto_admin + residentes del mismo tenant; board_member puede leer perfiles del coto)
CREATE POLICY "profiles_select_tenant"
  ON public.profiles FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    AND (
      id = auth.uid()
      OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
        'admin'::public.user_role,
        'coto_admin'::public.user_role,
        'resident'::public.user_role,
        'board_member'::public.user_role
      )
    )
  );

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

-- residents / deliveries
CREATE POLICY "residents_select_tenant"
  ON public.residents FOR SELECT
  USING (coto_id = public.current_user_coto_id());

CREATE POLICY "deliveries_tenant_select"
  ON public.deliveries FOR SELECT
  USING (coto_id = public.current_user_coto_id());

CREATE POLICY "deliveries_tenant_write"
  ON public.deliveries FOR INSERT
  WITH CHECK (coto_id = public.current_user_coto_id());

-- resto del patrón tenant
CREATE POLICY "logs_tenant_select"
  ON public.logs FOR SELECT
  USING (coto_id = public.current_user_coto_id());

CREATE POLICY "package_followup_prompts_tenant"
  ON public.package_followup_prompts FOR SELECT
  USING (coto_id = public.current_user_coto_id());

CREATE POLICY "proxy_sessions_tenant"
  ON public.proxy_sessions FOR ALL
  USING (coto_id = public.current_user_coto_id())
  WITH CHECK (coto_id = public.current_user_coto_id());

CREATE POLICY "proxy_messages_tenant"
  ON public.proxy_messages FOR ALL
  USING (coto_id = public.current_user_coto_id())
  WITH CHECK (coto_id = public.current_user_coto_id());

CREATE POLICY "visit_access_log_tenant_select"
  ON public.visit_access_log FOR SELECT
  USING (coto_id = public.current_user_coto_id());

CREATE POLICY "cotos_select"
  ON public.cotos FOR SELECT
  USING (
    id = public.current_user_coto_id()
    OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'admin'::public.user_role
  );

-- Usuarios en auth sin fila en profiles
INSERT INTO public.profiles (id, coto_id)
SELECT u.id, '00000000-0000-4000-8000-000000000001'::uuid
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

COMMIT;
