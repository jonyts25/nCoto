# Crea archivos .env locales desde plantillas si aún no existen.
# Ejecutar desde la raíz del repo:  .\scripts\setup-env.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Copy-IfMissing($example, $target, $label) {
  if (Test-Path $target) {
    Write-Host "[ok] Ya existe: $label ($target)" -ForegroundColor DarkGray
    return
  }
  if (-not (Test-Path $example)) {
    Write-Host "[!!] Falta plantilla: $example" -ForegroundColor Yellow
    return
  }
  Copy-Item $example $target
  Write-Host "[+] Creado: $label -> $target" -ForegroundColor Green
}

Copy-IfMissing "mobile\.env.example" "mobile\.env" "Mobile / Expo"
Copy-IfMissing "web\.env.example" "web\.env.local" "Web / Next.js"
Copy-IfMissing "bot\.env.example" "bot\.env" "Bot / Node"

Write-Host ""
Write-Host "Siguiente paso:" -ForegroundColor Cyan
Write-Host "  1. Abre mobile/.env, web/.env.local y bot/.env"
Write-Host "  2. Pega tus claves desde Supabase Dashboard -> Settings -> API"
Write-Host "  3. Ver env.template en la raíz para la lista completa de variables"
Write-Host ""
Write-Host "Instalar dependencias:" -ForegroundColor Cyan
Write-Host "  cd mobile && npm install && cd .."
Write-Host "  cd web && npm install && cd .."
Write-Host "  cd bot && npm install && cd .."
