import { GuardScanClient } from "@/components/guardia/GuardScanClient";

export const metadata = {
  title: "Caseta — Escaneo QR | NCoto",
  description: "Web de seguridad para lectores QR USB",
};

export default function GuardiaScanPage() {
  return <GuardScanClient />;
}
