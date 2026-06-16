import { CotoPropertiesDashboard } from "@/components/admin/CotoPropertiesDashboard";

export const metadata = {
  title: "Admin — Casas y morosidad | NCoto",
  description: "Panel web para administradores del coto: semáforo de morosidad por casa y cambio en un clic.",
};

export default function AdminDashboardPage() {
  return <CotoPropertiesDashboard />;
}
