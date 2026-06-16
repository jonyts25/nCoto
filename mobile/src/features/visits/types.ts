export type VisitStatus = "active" | "used" | "expired";

/** Eventual: un solo uso (marcado en caseta). Frecuente: recurrente por día/horario. Servicio/Paquetería: un solo día calendario. */
export type VisitKind = "eventual" | "frecuente" | "servicio" | "paqueteria";

/**
 * Rol de aplicación (public.profiles.role, enum `user_role` en Supabase).
 * No confundir con VisitKind (tipo de pase).
 */
export type UserAppRole = "resident" | "guard" | "admin" | "coto_admin" | "board_member";

export type WeeklySlot = {
  /** 0 = domingo … 6 = sábado (igual que Date.getDay()). */
  weekday: number;
  start: string;
  end: string;
};

export type Visit = {
  id: string;
  guestName: string;
  plates?: string;
  note?: string;
  createdAt: string;
  validUntil: string;
  status: VisitStatus;
  visitType: VisitKind;
  /** Solo tipo frecuente. */
  schedule?: WeeklySlot[];
  /** YYYY-MM-DD local — eventual, servicio, paquetería. */
  validDay?: string;
  /** Ventana horaria diaria (columnas start_time / end_time). HH:MM local. */
  startTime?: string;
  endTime?: string;
  ingresoConfirmadoAt?: string;
  lastAccessAt?: string;
};
