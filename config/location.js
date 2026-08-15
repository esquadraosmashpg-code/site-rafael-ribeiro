// Endereço do consultório -- fonte ÚNICA, num arquivo neutro de propósito.
// Tanto config/content.js (textos de exibição: rodapé, FAQ) quanto
// config/booking.js (regra operacional: gate do atendimento presencial,
// campo `location` do evento no Google Calendar) importam DAQUI, nunca um
// do outro -- evita qualquer acoplamento/ciclo entre "conteúdo do site" e
// "regras de agendamento", que são responsabilidades diferentes.
export const endereco = {
  logradouro: "Av. Dr. Sebastião Mendes da Silva, 287",
  bairro: "Anhangabaú",
  cidade: "Jundiaí",
  uf: "SP",
  cep: "13208-090",
  textoCompleto: "Av. Dr. Sebastião Mendes da Silva, 287 — Anhangabaú, Jundiaí/SP — CEP 13208-090",
  // URL universal de busca do Google Maps (não exige API key nem Place
  // ID) -- abre o endereço buscado por texto, funciona em qualquer
  // navegador/dispositivo.
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Av. Dr. Sebastião Mendes da Silva, 287, Anhangabaú, Jundiaí - SP, 13208-090"),
};
