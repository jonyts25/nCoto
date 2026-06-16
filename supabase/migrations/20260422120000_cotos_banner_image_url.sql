-- Banner opcional en home móvil / branding por coto.
ALTER TABLE public.cotos
  ADD COLUMN IF NOT EXISTS banner_image_url text;

COMMENT ON COLUMN public.cotos.banner_image_url IS 'URL pública (p. ej. Storage) del banner del coto; null = placeholder en app.';
