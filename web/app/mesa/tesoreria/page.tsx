import { BoardTreasuryClient } from "@/components/board/BoardTreasuryClient";

export const metadata = {
  title: "Tesorería — Mesa directiva | NCoto",
  description: "Saldo acumulado y movimientos financieros del coto para miembros de la mesa directiva.",
};

export default function MesaTesoreriaPage() {
  return <BoardTreasuryClient />;
}
