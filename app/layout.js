import "./globals.css";
import { site } from "@/config/content";

export const metadata = {
  title: site.titulo,
  description:
    "Transforme sua mente com hipnoterapia. O primeiro passo é a análise do seu caso com o Dr. Rafael Ribeiro — agende online.",
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
