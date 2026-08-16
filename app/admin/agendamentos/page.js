import AdminAgendamentosClient from "@/components/admin/AdminAgendamentosClient";

// Nunca indexar o painel administrativo -- também reforçado por
// X-Robots-Tag nas respostas das rotas /api/admin/agendamentos/*.
//
// `manifest` + `appleWebApp` habilitam "Adicionar à Tela de Início" no
// celular como um atalho dedicado (ícone e nome próprios, abre direto
// nesta tela, sem barra de endereço) -- ver public/admin-manifest.webmanifest
// e icon.js/apple-icon.js nesta mesma pasta.
export const metadata = {
  title: "Painel administrativo — Agendamentos",
  robots: { index: false, follow: false, noarchive: true },
  manifest: "/admin-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Agendamentos",
  },
};

export const viewport = {
  themeColor: "#101a30",
};

export default function AdminAgendamentosPage() {
  return <AdminAgendamentosClient />;
}
