import Link from "next/link";
import { site } from "@/config/content";

export default function LegalPage({ titulo, atualizado, children }) {
  return (
    <main className="min-h-screen bg-cream">
      <div className="bg-navy text-white py-10">
        <div className="max-w-3xl mx-auto px-6">
          <Link href="/" className="text-gold text-sm hover:underline">
            ← Voltar para o site
          </Link>
          <h1 className="text-2xl md:text-3xl font-serif mt-3">{titulo}</h1>
          {atualizado && (
            <p className="text-xs text-[#d8dce6] mt-2">Última atualização: {atualizado}</p>
          )}
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-10 text-[15px] leading-relaxed space-y-4">
        {children}
        <div className="mt-10 p-4 bg-cream2 rounded-xl text-xs text-gray-600 border border-gold/30">
          Texto em versão inicial (draft), gerado como parte do desenvolvimento do site de {site.nome}.
          Recomenda-se revisão por advogado especializado em LGPD e saúde antes da publicação oficial.
        </div>
      </div>
    </main>
  );
}
