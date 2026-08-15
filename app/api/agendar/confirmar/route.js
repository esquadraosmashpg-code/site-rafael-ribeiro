import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ROTA RETIRADA -- substituída pelo fluxo de reserva provisória com Pix e
// confirmação manual (regras comerciais definitivas confirmadas pelo
// Rafael: nunca confirmar automaticamente, sempre reservar por 30min e
// aguardar a validação manual do sinal). Mantida como stub (em vez de
// apagada) só para não devolver um 404 genérico pra qualquer chamada
// antiga/cacheada -- toda a lógica de criação de reserva agora vive em
// POST /api/agendar/reservar, e a criação do evento no Google Calendar só
// acontece em POST /api/admin/agendamentos/[id]/confirmar, depois da
// confirmação manual do sinal pelo Rafael. Ver:
//   - app/api/agendar/reservar/route.js
//   - app/api/agendar/reserva/[codigo]/status/route.js
//   - app/api/admin/agendamentos/[id]/confirmar/route.js
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Este endpoint foi descontinuado. Use POST /api/agendar/reservar -- o agendamento agora passa por uma reserva provisória de 30 minutos, com confirmação manual do sinal pelo Dr. Rafael.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
