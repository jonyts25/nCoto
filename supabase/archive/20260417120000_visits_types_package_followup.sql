-- NCoto: tipos de visita, horarios recurrentes, paquetería y seguimiento.
-- Aplicar en Supabase SQL Editor o con CLI. Ajustar políticas RLS según tu proyecto.

-- Columnas en visits
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'eventual'
    CHECK (visit_type IN ('eventual', 'frecuente', 'servicio', 'paqueteria'));

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS schedule jsonb;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS valid_day date;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS ingreso_confirmado_at timestamptz;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS last_access_at timestamptz;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS package_followup_sent_at timestamptz;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS tenant_package_received boolean;

COMMENT ON COLUMN public.visits.schedule IS 'Solo visit_type=frecuente: [{ "weekday": 0-6 (dom-sáb), "start": "HH:MM", "end": "HH:MM" }]';
COMMENT ON COLUMN public.visits.valid_day IS 'Día calendario de vigencia para eventual/servicio/paquetería (un solo día).';

UPDATE public.visits
SET valid_day = (valid_until AT TIME ZONE 'utc')::date
WHERE valid_day IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_paqueteria_followup
  ON public.visits (visit_type, valid_day)
  WHERE visit_type = 'paqueteria' AND status = 'active';

-- Bitácora de accesos (usada por mark_visit_used)
CREATE TABLE IF NOT EXISTS public.visit_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'guard',
  detail text
);

CREATE INDEX IF NOT EXISTS idx_visit_access_log_visit ON public.visit_access_log (visit_id, created_at DESC);

-- Seguimiento de pregunta por WhatsApp al inquilino (paquetería pendiente)
CREATE TABLE IF NOT EXISTS public.package_followup_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits (id) ON DELETE CASCADE,
  resident_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('received', 'not_received', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_pkg_followup_open
  ON public.package_followup_prompts (resident_id)
  WHERE closed_at IS NULL;

-- Candidatos para enviar pregunta al inquilino (fin de día, paquetería sin ingreso confirmado)
CREATE OR REPLACE FUNCTION public.paqueteria_followup_candidates(p_tz text DEFAULT 'America/Mexico_City')
RETURNS TABLE (
  visit_id uuid,
  resident_id uuid,
  guest_name text,
  valid_day date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.resident_id, v.guest_name, v.valid_day
  FROM public.visits v
  WHERE v.visit_type = 'paqueteria'
    AND v.status = 'active'
    AND v.ingreso_confirmado_at IS NULL
    AND v.valid_day = (timezone(p_tz, now()))::date
    AND v.package_followup_sent_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_visit_used(visit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.visits%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  INSERT INTO public.visit_access_log (visit_id, actor, detail)
  VALUES (visit_id, 'guard', 'Registro de acceso / ingreso');

  IF r.visit_type = 'frecuente' THEN
    UPDATE public.visits
    SET last_access_at = now()
    WHERE id = visit_id;
  ELSIF r.visit_type = 'paqueteria' THEN
    UPDATE public.visits
    SET
      ingreso_confirmado_at = now(),
      status = 'used'
    WHERE id = visit_id;
  ELSE
    -- eventual, servicio u otros: un solo uso
    UPDATE public.visits
    SET status = 'used'
    WHERE id = visit_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_paqueteria_visit_next_day(visit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.visits%ROWTYPE;
  new_day date;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;
  IF r.visit_type <> 'paqueteria' THEN
    RAISE EXCEPTION 'Solo aplica a visitas de paquetería';
  END IF;

  new_day := COALESCE(r.valid_day, (r.valid_until AT TIME ZONE 'utc')::date) + 1;

  UPDATE public.visits
  SET
    valid_day = new_day,
    valid_until = r.valid_until + interval '1 day',
    status = 'active',
    ingreso_confirmado_at = NULL,
    package_followup_sent_at = NULL,
    tenant_package_received = NULL
  WHERE id = visit_id;
END;
$$;

COMMENT ON FUNCTION public.extend_paqueteria_visit_next_day IS 'Extiende vigencia al día siguiente cuando el inquilino indica que no recibió el paquete.';

GRANT EXECUTE ON FUNCTION public.mark_visit_used(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_visit_used(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_paqueteria_visit_next_day(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_paqueteria_visit_next_day(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.paqueteria_followup_candidates(text) TO service_role;
