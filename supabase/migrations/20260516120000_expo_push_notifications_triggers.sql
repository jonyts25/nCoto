-- Notificaciones push (Expo): columna en profiles, cola vía pg_net hacia Edge Function push-notifications.
-- 1) Rellena ncoto_internal.push_edge_config (una fila) con la URL de la función, anon key y secreto compartido.
-- 2) En Supabase → Edge Functions → Secrets: PUSH_NOTIFICATIONS_WEBHOOK_SECRET (mismo valor que webhook_secret).

CREATE SCHEMA IF NOT EXISTS ncoto_internal;

CREATE TABLE IF NOT EXISTS ncoto_internal.push_edge_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  function_url text NOT NULL,
  anon_key text NOT NULL,
  webhook_secret text NOT NULL
);

COMMENT ON TABLE ncoto_internal.push_edge_config IS
  'Configuración opcional para disparar la Edge Function push-notifications desde triggers (no expuesta por API).';

REVOKE ALL ON SCHEMA ncoto_internal FROM PUBLIC;
REVOKE ALL ON TABLE ncoto_internal.push_edge_config FROM PUBLIC;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token text;

COMMENT ON COLUMN public.profiles.expo_push_token IS
  'Token Expo Push (ExponentPushToken[...]); lo escribe el cliente autenticado.';

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION ncoto_internal.enqueue_push_notification(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, ncoto_internal, net
AS $$
DECLARE
  cfg ncoto_internal.push_edge_config%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM ncoto_internal.push_edge_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF cfg.function_url IS NULL OR btrim(cfg.function_url) = ''
    OR cfg.anon_key IS NULL OR btrim(cfg.anon_key) = ''
    OR cfg.webhook_secret IS NULL OR btrim(cfg.webhook_secret) = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.anon_key,
      'x-ncoto-push-secret', cfg.webhook_secret
    ),
    body := payload
  );
END;
$$;

REVOKE ALL ON FUNCTION ncoto_internal.enqueue_push_notification(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_enqueue_push_on_announcement_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, ncoto_internal
AS $$
BEGIN
  PERFORM ncoto_internal.enqueue_push_notification(
    jsonb_build_object(
      'kind', 'announcement',
      'id', NEW.id
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enqueue_push_on_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, ncoto_internal
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.status NOT IN ('approved'::public.payment_submission_status, 'rejected'::public.payment_submission_status) THEN
    RETURN NEW;
  END IF;

  PERFORM ncoto_internal.enqueue_push_notification(
    jsonb_build_object(
      'kind', 'payment_submission',
      'id', NEW.id,
      'status', NEW.status::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_announcement_insert ON public.announcements;
CREATE TRIGGER trg_push_on_announcement_insert
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_push_on_announcement_insert();

DROP TRIGGER IF EXISTS trg_push_on_payment_submission_status ON public.payment_submissions;
CREATE TRIGGER trg_push_on_payment_submission_status
  AFTER INSERT OR UPDATE OF status ON public.payment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_push_on_payment_status_change();

-- Configuración (ejecutar manualmente tras desplegar la Edge Function; mismo secreto que PUSH_NOTIFICATIONS_WEBHOOK_SECRET):
-- INSERT INTO ncoto_internal.push_edge_config (id, function_url, anon_key, webhook_secret)
-- VALUES (
--   1,
--   'https://<PROJECT_REF>.supabase.co/functions/v1/push-notifications',
--   '<SUPABASE_ANON_KEY>',
--   '<PUSH_NOTIFICATIONS_WEBHOOK_SECRET>'
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   function_url = EXCLUDED.function_url,
--   anon_key = EXCLUDED.anon_key,
--   webhook_secret = EXCLUDED.webhook_secret;