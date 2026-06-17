export type VisitStatus = "active" | "used" | "expired";

export type VisitKind = "eventual" | "frecuente" | "servicio" | "paqueteria";

export type VisitUsageMode = "single_use" | "cycle";

export type VisitPresence = "outside" | "inside";

export type VisitAccessAction = "entry" | "exit" | "blocked";

export type VisitAccessReason =
  | "mora"
  | "pase_vencido"
  | "fuera_de_dia"
  | "fuera_de_horario"
  | "fuera_de_schedule"
  | "inactive"
  | "sin_permiso";

export type PeekVisitAccessAction = {
  action: VisitAccessAction;
  usageMode: VisitUsageMode;
  presence: VisitPresence | null;
  canRegister: boolean;
  reason: VisitAccessReason | string | null;
  isDelinquent: boolean;
};

export type RegisterVisitAccessResult = {
  ok: boolean;
  action: "entry" | "exit";
  presence: VisitPresence | null;
  visitId: string;
};

export type WeeklySlot = {
  weekday: number;
  start: string;
  end: string;
};

export type Visit = {
  id: string;
  residentId: string;
  guestName: string;
  plates?: string;
  note?: string;
  createdAt: string;
  validUntil: string;
  status: VisitStatus;
  visitType: VisitKind;
  schedule?: WeeklySlot[];
  validDay?: string;
  startTime?: string;
  endTime?: string;
  ingresoConfirmadoAt?: string;
  lastAccessAt?: string;
  usageMode?: VisitUsageMode;
  presence?: VisitPresence | null;
};
