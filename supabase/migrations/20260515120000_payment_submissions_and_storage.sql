-- Comprobantes de pago: tabla + RLS + bucket Storage payment-proofs

-- ---------------------------------------------------------------------------
-- 1) Enum y tabla
-- ---------------------------------------------------------------------------
DO $e$
BEGIN
  CREATE TYPE public.payment_submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$e$;

CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  image_url text NOT NULL,
  amount numeric(14, 2),
  status public.payment_submission_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_submissions_image_url_nonempty CHECK (btrim(image_url) <> '')
);

COMMENT ON TABLE public.payment_submissions IS 'Comprobantes subidos por residentes; revisión por admin/coto_admin.';
COMMENT ON COLUMN public.payment_submissions.image_url IS 'Ruta del objeto dentro del bucket payment-proofs (ej. uid/archivo.jpg).';

CREATE INDEX IF NOT EXISTS idx_payment_submissions_property ON public.payment_submissions (property_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON public.payment_submissions (status);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_created_by ON public.payment_submissions (created_by);

ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

-- Residente: ver solo lo que él envió
DROP POLICY IF EXISTS "payment_submissions_select_own" ON public.payment_submissions;
CREATE POLICY "payment_submissions_select_own"
  ON public.payment_submissions FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Admin / coto_admin: ver todos los del coto efectivo
DROP POLICY IF EXISTS "payment_submissions_select_admin_coto" ON public.payment_submissions;
CREATE POLICY "payment_submissions_select_admin_coto"
  ON public.payment_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties pr
      WHERE pr.id = payment_submissions.property_id
        AND pr.coto_id = public.current_user_coto_id()
    )
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );

-- Residente: insertar solo para su propiedad y como él mismo
DROP POLICY IF EXISTS "payment_submissions_insert_resident" ON public.payment_submissions;
CREATE POLICY "payment_submissions_insert_resident"
  ON public.payment_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND property_id = (SELECT pf.property_id FROM public.profiles pf WHERE pf.id = auth.uid())
    AND (SELECT pf.property_id FROM public.profiles pf WHERE pf.id = auth.uid()) IS NOT NULL
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'resident'::public.user_role
  );

-- Admin / coto_admin: actualizar (aprobar / rechazar / notas)
DROP POLICY IF EXISTS "payment_submissions_update_admin_coto" ON public.payment_submissions;
CREATE POLICY "payment_submissions_update_admin_coto"
  ON public.payment_submissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties pr
      WHERE pr.id = payment_submissions.property_id
        AND pr.coto_id = public.current_user_coto_id()
    )
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.properties pr
      WHERE pr.id = payment_submissions.property_id
        AND pr.coto_id = public.current_user_coto_id()
    )
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.payment_submissions TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Bucket Storage (privado)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Limpiar políticas previas del bucket (idempotente)
DROP POLICY IF EXISTS "payment_proofs_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_select_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_select_admin" ON storage.objects;

-- Subida: primer segmento del path = auth.uid()
CREATE POLICY "payment_proofs_insert_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Lectura: dueño de la carpeta (mismo uid) o admin/coto_admin del producto
CREATE POLICY "payment_proofs_select_own_folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "payment_proofs_select_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN (
      'admin'::public.user_role,
      'coto_admin'::public.user_role
    )
  );
