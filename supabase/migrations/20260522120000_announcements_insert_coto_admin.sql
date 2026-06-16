-- Permite a coto_admin (admin local), guardia y mesa directiva publicar alertas en su coto.
-- admin (superadmin) ya estaba incluido; se mantiene current_user_coto_id() para el alcance.

DROP POLICY IF EXISTS "announcements_insert_publishers" ON public.announcements;

CREATE POLICY "announcements_insert_publishers"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    coto_id = public.current_user_coto_id()
    AND created_by = auth.uid()
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role,
      'guard'::public.user_role,
      'board_member'::public.user_role
    )
  );

COMMENT ON POLICY "announcements_insert_publishers" ON public.announcements IS
  'Insertar alertas: admin, coto_admin, guard y board_member, solo en el coto efectivo (current_user_coto_id).';
