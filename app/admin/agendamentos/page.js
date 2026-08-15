import AdminAgendamentosClient from "@/components/admin/AdminAgendamentosClient";

// Nunca indexar o painel administrativo -- também reforçado por
// X-Robots-Tag nas respostas das rotas /api/admin/agendamentos/*.
export const metadata = {
  title: "Painel administrativo — Agendamentos",
  robots: { index: false, follow: false, noarchive: true },
};

export default function AdminAgendamentosPage() {
  return <AdminAgendamentosClient />;
}
