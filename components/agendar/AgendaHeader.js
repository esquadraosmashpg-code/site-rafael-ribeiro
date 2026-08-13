import Link from "next/link";
import { site } from "@/config/content";

export default function AgendaHeader() {
  return (
    <nav className="sticky top-0 z-50 bg-navy/95 backdrop-blur text-white">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-3">
        <Link href="/" className="font-bold tracking-wide">
          {site.nome} <span className="text-gold font-normal">| Hipnoterapeuta</span>
        </Link>
        <Link href="/" className="text-gold text-sm hover:underline">
          ← Voltar para o site
        </Link>
      </div>
    </nav>
  );
}
