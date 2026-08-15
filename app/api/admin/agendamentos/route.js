import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listAdminBookings, effectiveStatus } from "@/lib/booking/bookingRepository";

export const runtime = "nodejs";

function jsonNoStore(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init.headers,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

// GET /api/admin/agendamentos -- lista as reservas para o painel. Rota
// PROTEGIDA (sessão admin obrigatória): é a única rota deste projeto que
// pode devolver PII (nome/e-mail/telefone) do paciente.
export async function GET(request) {
  if (!hasValidAdminSession(request)) {
    return jsonNoStore({ error: "Não autenticado." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return jsonNoStore({ error: "Sistema de reservas não configurado." }, { status: 503 });
  }

  let rows;
  try {
    rows = await listAdminBookings();
  } catch (err) {
    console.error("[admin-agendamentos] erro ao listar reservas:", err.message);
    return jsonNoStore({ error: "Não foi possível listar as reservas agora." }, { status: 502 });
  }

  const now = new Date();
  const bookings = rows.map((b) => ({
    id: b.id,
    publicId: b.public_code,
    status: effectiveStatus(b, now),
    data: b.booking_date,
    horario: b.booking_time,
    modalidade: b.mode,
    nome: b.patient_name,
    email: b.patient_email,
    whatsapp: b.patient_phone,
    expiresAt: b.expires_at,
    confirmedAt: b.confirmed_at,
    createdAt: b.created_at,
  }));

  return jsonNoStore({ bookings });
}
