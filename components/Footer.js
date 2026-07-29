import { site } from "@/config/content";

export default function Footer() {
  return (
    <footer id="contato" className="bg-navy-dark text-[#aab0c0] py-12 text-sm mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-wrap justify-between gap-8 mb-8">
          <div>
            <h5 className="text-white font-semibold mb-3">{site.nome}</h5>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">WhatsApp</a>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">Instagram {site.instagram}</a>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">Localização e horários</a>
          </div>
          <div>
            <h5 className="text-white font-semibold mb-3">Institucional</h5>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">Política de Privacidade</a>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">LGPD</a>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">Cookies</a>
            <a href="#" className="block mb-2 opacity-85 hover:text-gold">Termos</a>
          </div>
        </div>
        <div className="border-t border-white/10 pt-5 text-center opacity-60 text-xs">
          © 2026 {site.nome} Hipnoterapeuta — Site por Smash Mídias
        </div>
      </div>
    </footer>
  );
}
