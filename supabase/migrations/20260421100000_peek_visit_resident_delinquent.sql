-- Caseta web / seguridad: morosidad del residente titular del pase (complementa current_user_property_is_delinquent() del titular).

CREATE OR REPLACE FUNCTION public.peek_visit_resident_is_delinquent(p_visit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phys_coto uuid;
  v_role public.user_role;
  v_out boolean;
BEGIN
  SELECT p.coto_id, p.role INTO v_phys_coto, v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'guard'::public.user_role THEN
    RAISE EXCEPTION 'Solo personal de seguridad puede usar esta función' USING ERRCODE = '42501';
  END IF;

  IF v_phys_coto IS NULL THEN
    RAISE EXCEPTION 'Perfil sin coto asignado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pr.is_delinquent, false)
  INTO v_out
  FROM public.visits v
  JOIN public.profiles pf ON pf.id = v.resident_id
  LEFT JOIN public.properties pr ON pr.id = pf.property_id
  WHERE v.id = p_visit_id
    AND v.coto_id = v_phys_coto;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada en el coto del guardia' USING ERRCODE = '42501';
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.peek_visit_resident_is_delinquent(uuid) IS
  'true si la propiedad vinculada al perfil del resident_id del pase está en mora. Usar en caseta (lectores QR). Ver también current_user_property_is_delinquent() para el propio usuario.';

GRANT EXECUTE ON FUNCTION public.peek_visit_resident_is_delinquent(uuid) TO authenticated;
