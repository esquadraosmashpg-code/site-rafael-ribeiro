import Link from "next/link";
import { ctaAgendar } from "@/config/content";

// Botão fixo na parte inferior, só no celular (md:hidden). Só é
// renderizado pela home (app/page.js) -- nunca aparece em /agendar (que
// tem seu próprio header com "Voltar para o site") nem nas páginas
// legais. z-40: fica abaixo do ChatWidget (z-[100], modal cheio de tela)
// mas acima do conteúdo normal. `pb-[env(safe-area-inset-bottom)]`
// respeita a barra inferior do iPhone. O espaçador correspondente antes
// do rodapé (app/page.js) garante que este botão nunca cubra o footer.
export default function MobileCTA() {
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-navy/95 backdrop-blur border-t border-white/10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      role="region"
      aria-label="Agendamento"
    >
      <Link
        href={ctaAgendar.href}
        className="block text-center bg-gold text-[#1b1200] px-5 py-3.5 rounded-full text-sm font-bold shadow-lg shadow-black/20"
      >
        {ctaAgendar.texto}
      </Link>
    </div>
  );
}
