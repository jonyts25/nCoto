-- Mesa directiva (rol board_member), finanzas por coto, avisos y disparo de ingresos al aprobar comprobantes.
-- El valor enum board_member se añade en 20260516095500_user_role_add_board_member_enum.sql (transacción previa).

-- ---------------------------------------------------------------------------
-- 1) Perfiles: lectura en tenant incluye mesa directiva
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_tenant" ON public.profiles;

CREATE POLICY "profiles_select_tenant"
  ON public.profiles FOR SELECT
  TO authenticated
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

-- Mesa directiva no reasigna roles
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
    ELSIF caller = 'board_member'::public.user_role THEN
      RAISE EXCEPTION 'La mesa directiva no puede modificar roles' USING ERRCODE = '42501';
    ELSIF caller NOT IN ('admin'::public.user_role, 'coto_admin'::public.user_role) THEN
      RAISE EXCEPTION 'Sin permiso para cambiar roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Finanzas del coto (ingresos automáticos + egresos manuales)
-- ---------------------------------------------------------------------------
DO $fe$
BEGIN
  CREATE TYPE public.coto_finance_entry_type AS ENUM ('payment_income', 'manual_expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fe$;

CREATE TABLE IF NOT EXISTS public.coto_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE CASCADE,
  entry_type public.coto_finance_entry_type NOT NULL,
  amount numeric(14, 2) NOT NULL,
  description text NOT NULL,
  payment_submission_id uuid REFERENCES public.payment_submissions (id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coto_finances_amount_positive CHECK (amount > 0)
);

COMMENT ON TABLE public.coto_finances IS 'Movimientos de tesorería por coto: ingreso al aprobar comprobante o egreso manual.';
COMMENT ON COLUMN public.coto_finances.payment_submission_id IS 'Solo ingresos automáticos; único por comprobante aprobado.';

CREATE INDEX IF NOT EXISTS idx_coto_finances_coto_created ON public.coto_finances (coto_id, created_at DESC);

ALTER TABLE public.coto_finances ENABLE ROW LEVEL SECURITY;

-- Lectura: administración y mesa (transparencia interna del coto)
DROP POLICY IF EXISTS "coto_finances_select_treasury" ON public.coto_finances;
CREATE POLICY "coto_finances_select_treasury"
  ON public.coto_finances FOR SELECT
  TO authenticated
  USING (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role,
      'board_member'::public.user_role
    )
  );

-- Egreso manual: admin, coto_admin o mesa
DROP POLICY IF EXISTS "coto_finances_insert_manual_expense" ON public.coto_finances;
CREATE POLICY "coto_finances_insert_manual_expense"
  ON public.coto_finances FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_type = 'manual_expense'::public.coto_finance_entry_type
    AND coto_id = public.current_user_coto_id()
    AND created_by = auth.uid()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role,
      'board_member'::public.user_role
    )
  );

-- Ingreso ligado a comprobante aprobado (invocador = quien aprueba: admin/coto_admin)
DROP POLICY IF EXISTS "coto_finances_insert_payment_income" ON public.coto_finances;
CREATE POLICY "coto_finances_insert_payment_income"
  ON public.coto_finances FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_type = 'payment_income'::public.coto_finance_entry_type
    AND payment_submission_id IS NOT NULL
    AND coto_id = public.current_user_coto_id()
    AND created_by = auth.uid()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
    AND EXISTS (
      SELECT 1
      FROM public.payment_submissions ps
      INNER JOIN public.properties pr ON pr.id = ps.property_id
      WHERE ps.id = payment_submission_id
        AND ps.status = 'approved'::public.payment_submission_status
        AND pr.coto_id = public.current_user_coto_id()
    )
  );

GRANT SELECT, INSERT ON public.coto_finances TO authenticated;

-- Disparo al aprobar comprobante (mismo rol de sesión que ejecutó el UPDATE)
CREATE OR REPLACE FUNCTION public.coto_finances_on_payment_approved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_coto uuid;
  v_amt numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'approved'::public.payment_submission_status THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM 'approved'::public.payment_submission_status THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'approved'::public.payment_submission_status THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.coto_finances cf WHERE cf.payment_submission_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT pr.coto_id, COALESCE(NEW.amount, 0) INTO v_coto, v_amt
  FROM public.properties pr
  WHERE pr.id = NEW.property_id;

  IF v_coto IS NULL OR v_amt IS NULL OR v_amt <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.coto_finances (
    coto_id,
    entry_type,
    amount,
    description,
    payment_submission_id,
    created_by
  )
  VALUES (
    v_coto,
    'payment_income'::public.coto_finance_entry_type,
    v_amt,
    'Ingreso por comprobante aprobado',
    NEW.id,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_submission_finance ON public.payment_submissions;
CREATE TRIGGER trg_payment_submission_finance
  AFTER INSERT OR UPDATE OF status ON public.payment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.coto_finances_on_payment_approved();

-- ---------------------------------------------------------------------------
-- 3) Avisos (announcements) + audiencia mesa directiva
-- ---------------------------------------------------------------------------
DO $an$
BEGIN
  CREATE TYPE public.announcement_category AS ENUM ('general', 'seguridad', 'proveedor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$an$;

DO $an2$
BEGIN
  CREATE TYPE public.announcement_audience AS ENUM ('all', 'residents', 'guards', 'admins', 'board_members');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$an2$;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE CASCADE,
  category public.announcement_category NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  audience public.announcement_audience NOT NULL DEFAULT 'residents',
  pinned boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT announcements_body_len CHECK (char_length(trim(body)) > 0),
  CONSTRAINT announcements_window_ok CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS announcements_coto_created_idx ON public.announcements (coto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_coto_active_idx ON public.announcements (coto_id, starts_at, ends_at);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_tenant" ON public.announcements;
CREATE POLICY "announcements_select_tenant"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    coto_id = public.current_user_coto_id()
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    AND (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
        'admin'::public.user_role,
        'coto_admin'::public.user_role
      )
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'resident'::public.user_role
        AND audience IN ('all'::public.announcement_audience, 'residents'::public.announcement_audience)
      )
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'guard'::public.user_role
        AND audience IN ('all'::public.announcement_audience, 'guards'::public.announcement_audience)
      )
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'board_member'::public.user_role
        AND audience IN (
          'all'::public.announcement_audience,
          'board_members'::public.announcement_audience,
          'admins'::public.announcement_audience
        )
      )
    )
  );

-- Solo admin (global), guardia o mesa pueden publicar (no coto_admin por requisito de producto)
DROP POLICY IF EXISTS "announcements_insert_publishers" ON public.announcements;
CREATE POLICY "announcements_insert_publishers"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND created_by = auth.uid()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'guard'::public.user_role,
      'board_member'::public.user_role
    )
  );

GRANT SELECT, INSERT ON public.announcements TO authenticated;
