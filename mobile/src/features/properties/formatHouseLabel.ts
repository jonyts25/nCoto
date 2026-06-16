/** Quita prefijos repetidos "Casa", "Casa:", etc. para comparar o mostrar solo el número/nombre. */
export function normalizeHouseKey(houseNumber: string): string {
  let s = String(houseNumber ?? "").trim().toLowerCase();
  while (/^casa\s*:?\s*/.test(s)) {
    s = s.replace(/^casa\s*:?\s*/, "").trim();
  }
  return s;
}

/** Etiqueta de UI: siempre "Casa: 102" aunque en BD venga "102", "Casa 102" o "casa: 102". */
export function formatHouseLabel(houseNumber: string): string {
  const raw = String(houseNumber ?? "").trim();
  if (!raw) return "Casa: —";
  const unit = normalizeHouseKey(raw);
  return `Casa: ${unit || raw}`;
}
