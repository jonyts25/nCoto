export type VisitStatus = "active" | "used" | "expired";

export type VisitKind = "eventual" | "frecuente" | "servicio" | "paqueteria";

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
};
