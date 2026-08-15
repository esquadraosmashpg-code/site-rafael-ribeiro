import Link from "next/link";
import { site, endereco } from "@/config/content";
import { buildWhatsappUrl } from "@/lib/booking/whatsappMessage";

export default function Footer() {
  return (
    <footer id="contato" className="bg-navy-dark text-[#aab0c0] py-12 text-sm mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-wrap justify-between gap-8 mb-8">
          <div>
            <h5 className="text-white font-semibold mb-3">{site.nome}</h5>
            <a
              href={buildWhatsappUrl(site.whatsappNumero)}
              target="_blank"
              rel="noreferrer"
              className="block mb-2 opacity-85 hover:text-gold"
            >
              WhatsApp
            </a>
            <a
              href={`https://instagram.com/${site.instagram.replace("@", "")}`}
              target="_blank"
              rel="noreferrer"
              className="block mb-2 opacity-85 hover:text-gold"
            >
              Instagram {site.instagram}
            </a>
            <h6 className="text-white/90 font-medium mt-4 mb-1">{site.localizacaoTexto}</h6>
            <p className="mb-1 opacity-85">{endereco.textoCompleto}</p>
            <a
              href={endereco.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-2 opacity-85 hover:text-gold"
            >
              Ver no Google Maps
            </a>
          </div>
          <div>
            <h5 className="text-white font-semibold mb-3">Institucional</h5>
            <Link href="/privacidade" className="block mb-2 opacity-85 hover:text-gold">Política de Privacidade</Link>
            <Link href="/lgpd" className="block mb-2 opacity-85 hover:text-gold">LGPD</Link>
            <Link href="/cookies" className="block mb-2 opacity-85 hover:text-gold">Cookies</Link>
            <Link href="/termos" className="block mb-2 opacity-85 hover:text-gold">Termos</Link>
          </div>
        </div>
        <div className="border-t border-white/10 pt-5 text-center opacity-60 text-xs">
          © 2026 {site.nome} Hipnoterapeuta — Site por Smash Mídias
        </div>
      </div>
    </footer>
  );
}
