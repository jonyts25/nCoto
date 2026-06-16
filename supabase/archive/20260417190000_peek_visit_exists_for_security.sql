-- Permite a la app móvil distinguir "fila no visible por RLS" vs "no existe el id",
-- comparando el resultado del SELECT del cliente con la existencia real (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.peek_visit_exists_for_security(p_visit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email = '' OR position('guardia' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Solo personal autorizado de seguridad puede usar esta función'
      USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.visits v WHERE v.id = p_visit_id);
END;
$$;

ALTER FUNCTION public.peek_visit_exists_for_security(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.peek_visit_exists_for_security(uuid) TO authenticated;
