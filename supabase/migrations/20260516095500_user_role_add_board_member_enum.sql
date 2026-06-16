-- Añade el valor board_member a user_role en su propia migración/transacción.
-- Evita SQLSTATE 55P04 ("unsafe use of new value") al referenciar board_member en políticas u otras migraciones posteriores.

DO $rb$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'board_member';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$rb$;
