-- Propiedades (unidad por coto), vínculo a residents/profiles, backfill y helpers RLS para morosidad.
-- Si public.properties ya existía en el proyecto con otro esquema, alinear columnas (coto_id, house_number, is_delinquent) antes de aplicar o fusionar a mano.

-- ---------------------------------------------------------------------------
-- 1) Tabla public.properties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coto_id uuid NOT NULL REFERENCES public.cotos (id) ON DELETE CASCADE,
  house_number text NOT NULL,
  display_label text,
  is_delinquent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT properties_house_not_empty CHECK (btrim(house_number) <> '')
);

COMMENT ON TABLE public.properties IS 'Unidad inmobiliaria por coto (casa/lote); morosidad vía is_delinquent.';
COMMENT ON COLUMN public.properties.is_delinquent IS 'Si true, las políticas de negocio (p. ej. visits INSERT) pueden bloquear al residente vinculado.';

CREATE UNIQUE INDEX IF NOT EXISTS properties_coto_house_unique
  ON public.properties (coto_id, (lower(btrim(house_number))));

CREATE INDEX IF NOT EXISTS idx_properties_coto_id ON public.properties (coto_id);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select_tenant" ON public.properties;
CREATE POLICY "properties_select_tenant"
  ON public.properties FOR SELECT
  USING (
    coto_id = public.current_user_coto_id()
    OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'admin'::public.user_role
  );

DROP POLICY IF EXISTS "properties_update_admin" ON public.properties;
CREATE POLICY "properties_update_admin"
  ON public.properties FOR UPDATE
  USING (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  )
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );

-- ---------------------------------------------------------------------------
-- 2) FKs en profiles y residents
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties (id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS house_number text;

COMMENT ON COLUMN public.profiles.property_id IS 'Unidad asignada al usuario app; NULL hasta backfill o onboarding.';
COMMENT ON COLUMN public.profiles.house_number IS 'Número de casa (denormalizado) para enlazar con properties al mismo coto.';

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.residents.property_id IS 'Propiedad canónica para esta fila del directorio.';

CREATE INDEX IF NOT EXISTS idx_profiles_property_id ON public.profiles (property_id);
CREATE INDEX IF NOT EXISTS idx_residents_property_id ON public.residents (property_id);

-- ---------------------------------------------------------------------------
-- 3) Función de backfill (idempotente; ejecutable manualmente o al final de esta migración)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_properties_from_residents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  ins int := 0;
  upd_res int := 0;
  upd_pr_match_res int := 0;
  upd_pr_by_house int := 0;
BEGIN
  -- Una fila en properties por (coto_id, house_number normalizado visual = btrim)
  INSERT INTO public.properties (coto_id, house_number)
  SELECT DISTINCT r.coto_id, btrim(r.house_number)
  FROM public.residents r
  WHERE btrim(r.house_number) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.coto_id = r.coto_id
        AND lower(btrim(p.house_number)) = lower(btrim(r.house_number))
    );

  GET DIAGNOSTICS ins = ROW_COUNT;

  UPDATE public.residents r
  SET property_id = p.id
  FROM public.properties p
  WHERE p.coto_id = r.coto_id
    AND lower(btrim(p.house_number)) = lower(btrim(r.house_number))
    AND (r.property_id IS DISTINCT FROM p.id);

  GET DIAGNOSTICS upd_res = ROW_COUNT;

  -- Perfiles cuyo id coincide con residents.id (mismo UUID)
  UPDATE public.profiles pr
  SET
    property_id = r.property_id,
    house_number = COALESCE(nullif(btrim(pr.house_number), ''), btrim(r.house_number))
  FROM public.residents r
  WHERE r.id = pr.id
    AND r.property_id IS NOT NULL
    AND (pr.property_id IS DISTINCT FROM r.property_id);

  GET DIAGNOSTICS upd_pr_match_res = ROW_COUNT;

  -- Perfiles con house_number explícito coincidente en el mismo coto
  UPDATE public.profiles pr
  SET property_id = p.id
  FROM public.properties p
  WHERE pr.coto_id = p.coto_id
    AND pr.house_number IS NOT NULL
    AND btrim(pr.house_number) <> ''
    AND lower(btrim(p.house_number)) = lower(btrim(pr.house_number))
    AND (pr.property_id IS DISTINCT FROM p.id);

  GET DIAGNOSTICS upd_pr_by_house = ROW_COUNT;

  RETURN jsonb_build_object(
    'properties_rows_inserted_this_run', ins,
    'residents_rows_updated', upd_res,
    'profiles_updated_via_resident_id', upd_pr_match_res,
    'profiles_updated_via_house_number', upd_pr_by_house
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_properties_from_residents() IS
  'Crea properties por cada (coto_id, house_number) distinto en residents y asigna property_id en residents y profiles.';

-- Ejecutar una vez con la migración
SELECT public.backfill_properties_from_residents();

-- ---------------------------------------------------------------------------
-- 4) Helpers de contexto para RLS (morosidad)
--    current_user_coto_id() se mantiene; añadimos property_id e is_delinquent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_property_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT p.property_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

COMMENT ON FUNCTION public.current_user_property_id() IS 'UUID de public.properties del usuario autenticado; NULL si sin asignar.';

CREATE OR REPLACE FUNCTION public.current_user_property_is_delinquent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (
      SELECT pr.is_delinquent
      FROM public.profiles p
      INNER JOIN public.properties pr ON pr.id = p.property_id
      WHERE p.id = auth.uid()
    ),
    false
  )
$$;

COMMENT ON FUNCTION public.current_user_property_is_delinquent() IS
  'true si el perfil tiene property_id y esa fila está en mora; false si sin propiedad o no moroso. Usar en WITH CHECK de RLS.';

-- Documentación en la función de tenant (sin cambiar semántica del retorno uuid)
COMMENT ON FUNCTION public.current_user_coto_id() IS
  'Tenant efectivo (coto) del usuario. Combinar con current_user_property_is_delinquent() para reglas de acceso por unidad.';

-- ---------------------------------------------------------------------------
-- 5) RLS visits: residentes morosos no pueden crear nuevas visitas (self-INSERT)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "visits_insert_tenant" ON public.visits;

CREATE POLICY "visits_insert_tenant"
  ON public.visits FOR INSERT
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND resident_id = auth.uid()
    AND NOT public.current_user_property_is_delinquent()
  );

REVOKE ALL ON FUNCTION public.backfill_properties_from_residents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_properties_from_residents() TO service_role;

GRANT EXECUTE ON FUNCTION public.current_user_property_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_property_is_delinquent() TO authenticated;

GRANT SELECT ON TABLE public.properties TO authenticated;
GRANT UPDATE ON TABLE public.properties TO authenticated;
