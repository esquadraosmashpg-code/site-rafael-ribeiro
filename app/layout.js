import "./globals.css";
import { site } from "@/config/content";

export const metadata = {
  title: site.titulo,
  description:
    "Transforme sua mente. Supere bloqueios. Viva com mais liberdade emocional. Recepção inteligente e pré-atendimento automatizado.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-[--foreground] font-sans">
        {children}
      </body>
    </html>
  );
}
