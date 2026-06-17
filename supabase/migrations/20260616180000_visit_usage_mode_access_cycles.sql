-- NCoto Fase 1.1 — usage_mode, presence, register_visit_access, hardening mark_visit_used.
-- Solo migración local; no aplicar en producción sin revisión.

-- ---------------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------------
DO $enums$
BEGIN
  CREATE TYPE public.visit_usage_mode AS ENUM ('single_use', 'cycle');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enums$;

DO $enums$
BEGIN
  CREATE TYPE public.visit_presence AS ENUM ('outside', 'inside');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enums$;

DO $enums$
BEGIN
  CREATE TYPE public.visit_access_event AS ENUM ('entry', 'exit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enums$;

-- ---------------------------------------------------------------------------
-- 2) Columnas visits
-- ---------------------------------------------------------------------------
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS usage_mode public.visit_usage_mode NOT NULL DEFAULT 'single_use';

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS presence public.visit_presence;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS start_time time;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN public.visits.usage_mode IS
  'single_use: un escaneo consume el pase. cycle: alterna entrada/salida (Fase 1.1).';
COMMENT ON COLUMN public.visits.presence IS
  'Solo usage_mode=cycle: outside|inside. NULL en single_use.';
COMMENT ON COLUMN public.visits.start_time IS
  'Ventana horaria diaria opcional (TIME). Paridad con validación cliente.';
COMMENT ON COLUMN public.visits.end_time IS
  'Ventana horaria diaria opcional (TIME). Paridad con validación cliente.';

-- Vigencia temporal en RPC: timezone canónica America/Mexico_City (ver _visit_temporal_access_check).

-- ---------------------------------------------------------------------------
-- 3) Backfill usage_mode y presence
-- ---------------------------------------------------------------------------
UPDATE public.visits
SET usage_mode = 'cycle'::public.visit_usage_mode
WHERE visit_type IN ('frecuente', 'servicio')
  AND usage_mode IS DISTINCT FROM 'cycle'::public.visit_usage_mode;

UPDATE public.visits
SET usage_mode = 'single_use'::public.visit_usage_mode
WHERE visit_type IN ('eventual', 'paqueteria')
  AND usage_mode IS DISTINCT FROM 'single_use'::public.visit_usage_mode;

UPDATE public.visits
SET presence = 'outside'::public.visit_presence
WHERE usage_mode = 'cycle'::public.visit_usage_mode
  AND presence IS NULL;

-- ---------------------------------------------------------------------------
-- 4) visit_access_log ampliado
-- ---------------------------------------------------------------------------
ALTER TABLE public.visit_access_log
  ADD COLUMN IF NOT EXISTS event_type public.visit_access_event;

ALTER TABLE public.visit_access_log
  ADD COLUMN IF NOT EXISTS guard_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

UPDATE public.visit_access_log
SET event_type = 'entry'::public.visit_access_event
WHERE event_type IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Helpers internos (sin GRANT a authenticated)
-- ---------------------------------------------------------------------------

-- Morosidad del titular del pase (sin chequeo de rol).
CREATE OR REPLACE FUNCTION public._visit_resident_is_delinquent(p_visit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(pr.is_delinquent, false)
  FROM public.visits v
  JOIN public.profiles pf ON pf.id = v.resident_id
  LEFT JOIN public.properties pr ON pr.id = pf.property_id
  WHERE v.id = p_visit_id;
$$;

COMMENT ON FUNCTION public._visit_resident_is_delinquent(uuid) IS
  'Interno: morosidad del resident_id del pase. Usar desde RPC con auth ya validado.';

-- Coto efectivo del caller para operaciones de caseta (guardia: físico; admin: active_coto_id).
CREATE OR REPLACE FUNCTION public._visit_access_caller_context(
  OUT caller_role public.user_role,
  OUT caller_phys_coto uuid,
  OUT caller_effective_coto uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  SELECT p.role, p.coto_id,
    CASE
      WHEN p.role = 'admin'::public.user_role THEN COALESCE(p.active_coto_id, p.coto_id)
      ELSE p.coto_id
    END
  INTO caller_role, caller_phys_coto, caller_effective_coto
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Valida que auth.uid() puede registrar acceso en el coto de la visita.
CREATE OR REPLACE FUNCTION public._assert_visit_access_caller(p_visit_coto_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  ctx record;
BEGIN
  SELECT * INTO ctx FROM public._visit_access_caller_context();

  IF ctx.caller_role NOT IN (
    'guard'::public.user_role,
    'admin'::public.user_role,
    'coto_admin'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Sin permiso para registrar acceso en caseta'
      USING ERRCODE = '42501';
  END IF;

  IF ctx.caller_effective_coto IS NULL THEN
    RAISE EXCEPTION 'Perfil sin coto asignado' USING ERRCODE = '42501';
  END IF;

  IF p_visit_coto_id IS DISTINCT FROM ctx.caller_effective_coto THEN
    RAISE EXCEPTION 'La visita no pertenece al coto operativo del usuario'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Validación temporal server-side (paridad canValidateVisitNow en cliente).
-- Retorna NULL si OK; códigos: inactive, pase_vencido, fuera_de_dia, fuera_de_horario, fuera_de_schedule.
-- Salida (exit): solo exige status active; no valida vigencia ni horario.
CREATE OR REPLACE FUNCTION public._visit_temporal_access_check(
  p_visit public.visits,
  p_action public.visit_access_event
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_local_ts timestamp;
  v_local_date date;
  v_local_dow int;
  v_local_mins int;
  v_end_boundary timestamptz;
  v_elem jsonb;
  v_weekday int;
  v_start_mins int;
  v_end_mins int;
  v_in_slot boolean;
BEGIN
  IF p_action = 'exit'::public.visit_access_event THEN
    IF p_visit.status IS DISTINCT FROM 'active' THEN
      RETURN 'inactive';
    END IF;
    RETURN NULL;
  END IF;

  -- entry
  IF p_visit.status IS DISTINCT FROM 'active' THEN
    RETURN 'inactive';
  END IF;

  v_local_ts := timezone('America/Mexico_City', now());
  v_local_date := v_local_ts::date;
  v_local_dow := EXTRACT(DOW FROM v_local_ts)::int;
  v_local_mins := EXTRACT(HOUR FROM v_local_ts)::int * 60 + EXTRACT(MINUTE FROM v_local_ts)::int;

  IF p_visit.valid_day IS NOT NULL THEN
    v_end_boundary :=
      ((p_visit.valid_day + 1)::timestamp AT TIME ZONE 'America/Mexico_City') - interval '1 microsecond';
    IF now() > v_end_boundary THEN
      RETURN 'pase_vencido';
    END IF;
  ELSIF p_visit.valid_until IS NOT NULL THEN
    v_end_boundary :=
      (((timezone('America/Mexico_City', p_visit.valid_until))::date + 1)::timestamp
        AT TIME ZONE 'America/Mexico_City') - interval '1 microsecond';
    IF now() > v_end_boundary THEN
      RETURN 'pase_vencido';
    END IF;
  END IF;

  IF p_visit.visit_type = 'frecuente' THEN
    IF p_visit.schedule IS NULL
       OR jsonb_typeof(p_visit.schedule) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_visit.schedule) = 0 THEN
      RETURN 'fuera_de_schedule';
    END IF;

    v_in_slot := false;
    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_visit.schedule)
    LOOP
      BEGIN
        v_weekday := (v_elem->>'weekday')::int;
        v_start_mins :=
          split_part(v_elem->>'start', ':', 1)::int * 60 + split_part(v_elem->>'start', ':', 2)::int;
        v_end_mins :=
          split_part(v_elem->>'end', ':', 1)::int * 60 + split_part(v_elem->>'end', ':', 2)::int;
      EXCEPTION
        WHEN OTHERS THEN
          CONTINUE;
      END;

      IF v_weekday = v_local_dow
         AND v_local_mins >= v_start_mins
         AND v_local_mins <= v_end_mins THEN
        v_in_slot := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_in_slot THEN
      RETURN 'fuera_de_schedule';
    END IF;

    RETURN NULL;
  END IF;

  IF p_visit.visit_type IN ('eventual', 'servicio', 'paqueteria') THEN
    IF p_visit.valid_day IS NOT NULL AND p_visit.valid_day <> v_local_date THEN
      RETURN 'fuera_de_dia';
    END IF;
  END IF;

  IF p_visit.start_time IS NOT NULL AND p_visit.end_time IS NOT NULL THEN
    v_start_mins :=
      EXTRACT(HOUR FROM p_visit.start_time)::int * 60 + EXTRACT(MINUTE FROM p_visit.start_time)::int;
    v_end_mins :=
      EXTRACT(HOUR FROM p_visit.end_time)::int * 60 + EXTRACT(MINUTE FROM p_visit.end_time)::int;

    IF v_start_mins >= v_end_mins THEN
      RETURN 'fuera_de_horario';
    END IF;

    IF v_local_mins < v_start_mins OR v_local_mins > v_end_mins THEN
      RETURN 'fuera_de_horario';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public._visit_temporal_access_check(public.visits, public.visit_access_event) IS
  'Interno: vigencia/horario en servidor (America/Mexico_City). exit solo exige active.';

CREATE OR REPLACE FUNCTION public._visit_temporal_access_raise(p_reason text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION '%', CASE p_reason
    WHEN 'inactive' THEN 'El pase no está activo'
    WHEN 'pase_vencido' THEN 'La vigencia del pase ya expiró'
    WHEN 'fuera_de_dia' THEN 'Fuera del día autorizado para el pase'
    WHEN 'fuera_de_horario' THEN 'Fuera del horario permitido'
    WHEN 'fuera_de_schedule' THEN 'Fuera del día u horario de la visita frecuente'
    ELSE 'Acceso bloqueado: ' || p_reason
  END USING ERRCODE = 'P0001';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) register_visit_access — RPC principal Fase 1.1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_visit_access(
  p_visit_id uuid,
  p_plates text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r public.visits%ROWTYPE;
  v_delinquent boolean;
  v_action public.visit_access_event;
  v_new_presence public.visit_presence;
  v_guard_id uuid;
  v_temporal_reason text;
BEGIN
  v_guard_id := auth.uid();
  IF v_guard_id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  PERFORM public._assert_visit_access_caller(r.coto_id);

  -- Acción prevista (entrada/salida) antes de validar vigencia y mora.
  IF r.usage_mode = 'single_use'::public.visit_usage_mode THEN
    v_action := 'entry'::public.visit_access_event;
  ELSIF COALESCE(r.presence, 'outside'::public.visit_presence) = 'outside'::public.visit_presence THEN
    v_action := 'entry'::public.visit_access_event;
  ELSIF r.presence = 'inside'::public.visit_presence THEN
    v_action := 'exit'::public.visit_access_event;
  ELSE
    RAISE EXCEPTION 'Estado de presencia inválido' USING ERRCODE = 'P0001';
  END IF;

  v_temporal_reason := public._visit_temporal_access_check(r, v_action);
  PERFORM public._visit_temporal_access_raise(v_temporal_reason);

  v_delinquent := public._visit_resident_is_delinquent(p_visit_id);

  IF r.usage_mode = 'single_use'::public.visit_usage_mode THEN
    IF v_delinquent THEN
      RAISE EXCEPTION 'Ingreso bloqueado: unidad en mora' USING ERRCODE = 'P0001';
    END IF;

    v_action := 'entry'::public.visit_access_event;
    v_new_presence := NULL;

    PERFORM set_config('ncoto.allow_access_state_update', '1', true);

    IF r.visit_type = 'paqueteria' THEN
      UPDATE public.visits
      SET
        status = 'used',
        ingreso_confirmado_at = now(),
        plates = COALESCE(NULLIF(btrim(p_plates), ''), plates),
        note = COALESCE(NULLIF(btrim(p_note), ''), note)
      WHERE id = p_visit_id;
    ELSE
      UPDATE public.visits
      SET
        status = 'used',
        plates = COALESCE(NULLIF(btrim(p_plates), ''), plates),
        note = COALESCE(NULLIF(btrim(p_note), ''), note)
      WHERE id = p_visit_id;
    END IF;

  ELSIF r.usage_mode = 'cycle'::public.visit_usage_mode THEN
    IF v_action = 'entry'::public.visit_access_event THEN
      IF v_delinquent THEN
        RAISE EXCEPTION 'Ingreso bloqueado: unidad en mora' USING ERRCODE = 'P0001';
      END IF;

      v_new_presence := 'inside'::public.visit_presence;

      PERFORM set_config('ncoto.allow_access_state_update', '1', true);

      UPDATE public.visits
      SET
        presence = 'inside'::public.visit_presence,
        last_access_at = now(),
        ingreso_confirmado_at = COALESCE(ingreso_confirmado_at, now()),
        plates = COALESCE(NULLIF(btrim(p_plates), ''), plates),
        note = COALESCE(NULLIF(btrim(p_note), ''), note)
      WHERE id = p_visit_id;

    ELSE
      -- Salida: mora no bloquea (Fase 1.1); vigencia ya validada (solo active).
      v_new_presence := 'outside'::public.visit_presence;

      PERFORM set_config('ncoto.allow_access_state_update', '1', true);

      UPDATE public.visits
      SET
        presence = 'outside'::public.visit_presence,
        plates = COALESCE(NULLIF(btrim(p_plates), ''), plates),
        note = COALESCE(NULLIF(btrim(p_note), ''), note)
      WHERE id = p_visit_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'usage_mode no soportado' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.visit_access_log (
    visit_id,
    actor,
    detail,
    coto_id,
    event_type,
    guard_id
  )
  VALUES (
    p_visit_id,
    'guard',
    CASE
      WHEN v_action = 'entry'::public.visit_access_event THEN 'Entrada registrada'
      ELSE 'Salida registrada'
    END,
    r.coto_id,
    v_action,
    v_guard_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', v_action::text,
    'presence', CASE WHEN v_new_presence IS NULL THEN NULL ELSE v_new_presence::text END,
    'visit_id', p_visit_id
  );
END;
$$;

COMMENT ON FUNCTION public.register_visit_access(uuid, text, text) IS
  'Fase 1.1: registra entrada o salida bajo lock. auth.uid() debe ser guard/admin/coto_admin del mismo coto.';

-- ---------------------------------------------------------------------------
-- 7) mark_visit_used — endurecida + compatibilidad clientes v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_visit_used(visit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r public.visits%ROWTYPE;
  v_guard_id uuid;
BEGIN
  v_guard_id := auth.uid();
  IF v_guard_id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  PERFORM public._assert_visit_access_caller(r.coto_id);

  IF r.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'El pase no está activo' USING ERRCODE = 'P0001';
  END IF;

  -- Compatibilidad v1: pase cycle ya "inside" (p. ej. frecuente re-escaneado) → no alternar a salida.
  IF r.usage_mode = 'cycle'::public.visit_usage_mode
     AND r.presence = 'inside'::public.visit_presence THEN
    PERFORM set_config('ncoto.allow_access_state_update', '1', true);

    UPDATE public.visits
    SET last_access_at = now()
    WHERE id = visit_id;

    INSERT INTO public.visit_access_log (
      visit_id, actor, detail, coto_id, event_type, guard_id
    )
    VALUES (
      visit_id,
      'guard',
      'Registro de acceso / ingreso (compat v1)',
      r.coto_id,
      'entry'::public.visit_access_event,
      v_guard_id
    );
    RETURN;
  END IF;

  PERFORM public.register_visit_access(visit_id, NULL, NULL);
END;
$$;

COMMENT ON FUNCTION public.mark_visit_used(uuid) IS
  'Compat v1: delega en register_visit_access salvo cycle+inside (solo last_access_at; sin validación temporal). Requiere guard/admin/coto_admin.';

-- ---------------------------------------------------------------------------
-- 8) peek_visit_access_action — preview para UI (Fase 1.1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.peek_visit_access_action(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r public.visits%ROWTYPE;
  v_delinquent boolean;
  v_presence public.visit_presence;
  v_action public.visit_access_event;
  v_action_text text;
  v_can boolean := false;
  v_reason text := NULL;
  v_temporal_reason text;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = p_visit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'action', 'blocked',
      'usage_mode', NULL,
      'presence', NULL,
      'is_delinquent', false,
      'can_register', false,
      'reason', 'Visita no encontrada'
    );
  END IF;

  PERFORM public._assert_visit_access_caller(r.coto_id);

  v_delinquent := public._visit_resident_is_delinquent(p_visit_id);

  IF r.usage_mode = 'single_use'::public.visit_usage_mode THEN
    v_action := 'entry'::public.visit_access_event;
    v_action_text := 'entry';
    v_presence := NULL;
  ELSE
    v_presence := COALESCE(r.presence, 'outside'::public.visit_presence);
    IF v_presence = 'outside'::public.visit_presence THEN
      v_action := 'entry'::public.visit_access_event;
      v_action_text := 'entry';
    ELSE
      v_action := 'exit'::public.visit_access_event;
      v_action_text := 'exit';
    END IF;
  END IF;

  v_temporal_reason := public._visit_temporal_access_check(r, v_action);
  IF v_temporal_reason IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'blocked',
      'usage_mode', r.usage_mode::text,
      'presence', CASE WHEN r.presence IS NULL THEN NULL ELSE r.presence::text END,
      'is_delinquent', v_delinquent,
      'can_register', false,
      'reason', v_temporal_reason
    );
  END IF;

  IF v_action = 'entry'::public.visit_access_event AND v_delinquent THEN
    RETURN jsonb_build_object(
      'action', 'blocked',
      'usage_mode', r.usage_mode::text,
      'presence', CASE WHEN v_presence IS NULL THEN NULL ELSE v_presence::text END,
      'is_delinquent', true,
      'can_register', false,
      'reason', 'mora'
    );
  END IF;

  RETURN jsonb_build_object(
    'action', v_action_text,
    'usage_mode', r.usage_mode::text,
    'presence', CASE WHEN v_presence IS NULL THEN NULL ELSE v_presence::text END,
    'is_delinquent', v_delinquent,
    'can_register', true,
    'reason', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.peek_visit_access_action(uuid) IS
  'Preview Fase 1.1: acción sugerida entry|exit|blocked, mora y can_register. Solo guard/admin/coto_admin.';

-- ---------------------------------------------------------------------------
-- 9) Trigger: residentes (y clientes) no mutan usage_mode / presence directo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visits_protect_access_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF COALESCE(current_setting('ncoto.allow_access_state_update', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.usage_mode IS DISTINCT FROM OLD.usage_mode
     OR NEW.presence IS DISTINCT FROM OLD.presence THEN
    RAISE EXCEPTION 'usage_mode y presence solo se actualizan vía registro de acceso en caseta'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_protect_access_state ON public.visits;
CREATE TRIGGER trg_visits_protect_access_state
  BEFORE UPDATE ON public.visits
  FOR EACH ROW
  EXECUTE FUNCTION public.visits_protect_access_state();

-- Defaults en INSERT para nuevos pases (sin depender del cliente).
CREATE OR REPLACE FUNCTION public.visits_set_default_usage_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.visit_type IN ('frecuente', 'servicio') THEN
    NEW.usage_mode := 'cycle'::public.visit_usage_mode;
    IF NEW.presence IS NULL THEN
      NEW.presence := 'outside'::public.visit_presence;
    END IF;
  ELSE
    NEW.usage_mode := 'single_use'::public.visit_usage_mode;
    NEW.presence := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_set_default_usage_mode ON public.visits;
CREATE TRIGGER trg_visits_set_default_usage_mode
  BEFORE INSERT ON public.visits
  FOR EACH ROW
  EXECUTE FUNCTION public.visits_set_default_usage_mode();

-- ---------------------------------------------------------------------------
-- 10) RLS visit_access_log
-- ---------------------------------------------------------------------------
ALTER TABLE public.visit_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_access_log_tenant" ON public.visit_access_log;
DROP POLICY IF EXISTS "visit_access_log_tenant_select" ON public.visit_access_log;

CREATE POLICY "visit_access_log_select_staff"
  ON public.visit_access_log
  FOR SELECT
  USING (
    coto_id = (
      SELECT CASE
        WHEN p.role = 'admin'::public.user_role THEN COALESCE(p.active_coto_id, p.coto_id)
        ELSE p.coto_id
      END
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
    AND (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) IN (
      'guard'::public.user_role,
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );

CREATE POLICY "visit_access_log_select_resident_own"
  ON public.visit_access_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = visit_access_log.visit_id
        AND v.resident_id = auth.uid()
    )
    AND (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'resident'::public.user_role
  );

REVOKE INSERT, UPDATE, DELETE ON public.visit_access_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.visit_access_log FROM anon;

-- ---------------------------------------------------------------------------
-- 11) Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mark_visit_used(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_visit_used(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.register_visit_access(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_visit_access(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.peek_visit_access_action(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peek_visit_access_action(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._visit_resident_is_delinquent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._visit_access_caller_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_visit_access_caller(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._visit_temporal_access_check(public.visits, public.visit_access_event) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._visit_temporal_access_raise(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_visit_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_visit_access(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_visit_used(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_visit_used(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.peek_visit_access_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_visit_access_action(uuid) TO service_role;
