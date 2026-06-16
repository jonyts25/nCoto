/**
 * Paleta oficial NCoto — confianza, seguridad, claridad.
 * Usar estos tokens en UI móvil para alinear con identidad de marca.
 */
export const colors = {
  /** Azul NCoto — Confianza */
  primary: "#0077B6",
  /** Verde circuito — Seguridad */
  success: "#4CAF50",
  /** Emergencia / morosidad */
  danger: "#E63946",
  /** Fondo ultra-claro — Claridad */
  background: "#F8F9FA",
  /** Texto principal sobre fondos claros */
  text: "#1A1A1A",
  /** Texto secundario */
  textMuted: "#5C6370",
  /** Superficie tarjeta / inputs */
  surface: "#FFFFFF",
  /** Bordes suaves */
  border: "#DEE2E6",
} as const;

export type NcotoColorKey = keyof typeof colors;
