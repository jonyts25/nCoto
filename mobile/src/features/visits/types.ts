export type VisitStatus = "active" | "used" | "expired";

export type Visit = {
  id: string;           // uuid o random
  guestName: string;
  plates?: string;
  note?: string;
  createdAt: string;    // ISO
  validUntil: string;   // ISO
  status: VisitStatus;
};
