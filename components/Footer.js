import Link from "next/link";
import { site, endereco } from "@/config/content";
import { buildWhatsappUrl } from "@/lib/booking/whatsappMessage";

// Hierarquia de contraste do rodapé (fundo #101a30 / navy-dark) --
// substituiu o antigo esquema de "uma cor só + opacidade reduzida em tudo", que
// deixava título, texto e links todos com a mesma intensidade visual
// (e a opacity ainda escurecia o dourado do hover, reduzindo o
// contraste justamente quando o link estava em foco). Três níveis,
// todos verificados manualmente contra WCAG AA (contraste mínimo 4.5:1
// pra texto normal):
//   - título (h5/h6): branco sólido -- maior destaque, ~19:1
//   - texto de corpo (endereço): #c9cfdc -- ~11:1
//   - links (WhatsApp/Instagram/Maps/institucional/copyright): #9aa3b8
//     em repouso (~6.9:1), dourado no hover/foco (~5.6:1) -- sempre
//     acima do mínimo AA nos dois estados.
const TEXTO_CORPO = "text-[#c9cfdc]";
const LINK_RODAPE =
  "block mb-2 text-[#9aa3b8] hover:text-gold focus-visible:text-gold transition-colors";

export default function Footer() {
  return (
    <footer id="contato" className="bg-navy-dark text-[#9aa3b8] py-12 text-sm mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-wrap justify-between gap-8 mb-8">
          <div>
            <h5 className="text-white font-semibold mb-3">{site.nome}</h5>
            <a
              href={buildWhatsappUrl(site.whatsappNumero)}
              target="_blank"
              rel="noreferrer"
              className={LINK_RODAPE}
            >
              WhatsApp
            </a>
            <a
              href={`https://instagram.com/${site.instagram.replace("@", "")}`}
              target="_blank"
              rel="noreferrer"
              className={LINK_RODAPE}
            >
              Instagram {site.instagram}
            </a>
            <h6 className="text-white font-medium mt-4 mb-1">{site.localizacaoTexto}</h6>
            <p className={`mb-1 ${TEXTO_CORPO}`}>{endereco.textoCompleto}</p>
            <a href={endereco.mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK_RODAPE}>
              Ver no Google Maps
            </a>
          </div>
          <div>
            <h5 className="text-white font-semibold mb-3">Institucional</h5>
            <Link href="/privacidade" className={LINK_RODAPE}>Política de Privacidade</Link>
            <Link href="/lgpd" className={LINK_RODAPE}>LGPD</Link>
            <Link href="/cookies" className={LINK_RODAPE}>Cookies</Link>
            <Link href="/termos" className={LINK_RODAPE}>Termos</Link>
          </div>
        </div>
        <div className="border-t border-white/10 pt-5 text-center text-[#7f8aa3] text-xs">
          © 2026 {site.nome} Hipnoterapeuta — Site por Smash Mídias
        </div>
      </div>
    </footer>
  );
}
