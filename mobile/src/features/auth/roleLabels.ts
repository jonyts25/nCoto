import type { UserAppRole } from "@/src/features/visits/types";

/** Etiquetas en español para UI; valores en BD siguen siendo en inglés. */
export function userRoleLabelEs(role: UserAppRole): string {
  switch (role) {
    case "admin":
      return "Superadministrador";
    case "coto_admin":
      return "Administrador del coto";
    case "guard":
      return "Guardia";
    case "resident":
      return "Residente";
    case "board_member":
      return "Mesa directiva";
    default:
      return String(role);
  }
}
