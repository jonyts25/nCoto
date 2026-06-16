#!/usr/bin/env bash
# Crea archivos .env locales desde plantillas si aún no existen.
# Ejecutar desde la raíz:  chmod +x scripts/setup-env.sh && ./scripts/setup-env.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

copy_if_missing() {
  local example="$1"
  local target="$2"
  local label="$3"
  if [[ -f "$target" ]]; then
    echo "[ok] Ya existe: $label ($target)"
    return
  fi
  if [[ ! -f "$example" ]]; then
    echo "[!!] Falta plantilla: $example"
    return
  fi
  cp "$example" "$target"
  echo "[+] Creado: $label -> $target"
}

copy_if_missing "mobile/.env.example" "mobile/.env" "Mobile / Expo"
copy_if_missing "web/.env.example" "web/.env.local" "Web / Next.js"
copy_if_missing "bot/.env.example" "bot/.env" "Bot / Node"

echo ""
echo "Siguiente paso:"
echo "  1. Edita mobile/.env, web/.env.local y bot/.env con tus claves de Supabase"
echo "  2. Ver env.template en la raíz para variables opcionales (bot, Meta, cron)"
echo ""
echo "Instalar dependencias:"
echo "  (cd mobile && npm install) && (cd web && npm install) && (cd bot && npm install)"
