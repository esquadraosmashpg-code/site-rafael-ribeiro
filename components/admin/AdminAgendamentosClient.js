"use client";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS = {
  PENDING_PAYMENT: "Aguardando pagamento",
  CONFIRMING: "Confirmando…",
  CONFIRMED: "Confirmado",
  EXPIRED: "Expirado",
  PAYMENT_REJECTED: "Pagamento não identificado",
  UNKNOWN: "Indefinido — verificar manualmente",
};

const MODALIDADE_LABELS = { online: "Online", presencial: "Presencial" };

function formatTempoRestante(expiresAtISO, now) {
  const diffMs = new Date(expiresAtISO).getTime() - now;
  if (diffMs <= 0) return "expirado";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function AdminAgendamentosClient() {
  const [authState, setAuthState] = useState("checking"); // checking | anon | authed
  const [senha, setSenha] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [listError, setListError] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [actionState, setActionState] = useState({}); // id -> "confirmar" | "rejeitar" | null
  const [now, setNow] = useState(() => Date.now());

  const carregarLista = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/agendamentos", { cache: "no-store" });
      if (res.status === 401) {
        setAuthState("anon");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setListError(data?.error || "Não foi possível carregar as reservas.");
        return;
      }
      setBookings(data.bookings || []);
      setAuthState("authed");
    } catch {
      setListError("Erro de conexão ao carregar as reservas.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    // Busca disparada por mudança de dependência (montagem do painel) --
    // caso legítimo de efeito + setState (carregarLista atualiza vários
    // estados internamente conforme o resultado do fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarLista();
  }, [carregarLista]);

  // Só pra exibir o contador -- a autoridade sobre expiração continua
  // sendo o servidor (a cada ação, a rota revalida do zero).
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/agendamentos/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const data = await res.json();
      setSenha(""); // nunca mantém a senha em estado depois do envio
      if (!res.ok) {
        setLoginError(data?.error || "Não foi possível entrar.");
        return;
      }
      await carregarLista();
    } catch {
      setLoginError("Erro de conexão.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/agendamentos/logout", { method: "POST" });
    } finally {
      setAuthState("anon");
      setBookings([]);
    }
  }

  async function handleAction(id, acao) {
    setActionState((s) => ({ ...s, [id]: acao }));
    try {
      const res = await fetch(`/api/admin/agendamentos/${id}/${acao}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error || "Não foi possível concluir a ação.");
      }
      await carregarLista();
    } catch {
      window.alert("Erro de conexão ao executar a ação.");
    } finally {
      setActionState((s) => ({ ...s, [id]: null }));
    }
  }

  if (authState === "checking") {
    return <div className="p-8 text-center text-gray-500">Carregando…</div>;
  }

  if (authState === "anon") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream2 px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-md p-6 w-full max-w-sm space-y-4">
          <h1 className="text-lg font-serif text-navy">Painel administrativo</h1>
          <label className="block text-sm text-gray-600">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </label>
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-navy text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-60"
          >
            {loginLoading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream2 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-serif text-navy">Agendamentos — reservas</h1>
          <div className="flex gap-2">
            <button onClick={carregarLista} className="text-sm text-navy underline">
              Atualizar
            </button>
            <button onClick={handleLogout} className="text-sm text-red-600 underline">
              Sair
            </button>
          </div>
        </div>

        {listError && <p className="text-sm text-red-600">{listError}</p>}
        {listLoading && bookings.length === 0 && <p className="text-sm text-gray-500">Carregando reservas…</p>}
        {!listLoading && bookings.length === 0 && !listError && (
          <p className="text-sm text-gray-500">Nenhuma reserva encontrada.</p>
        )}

        <div className="overflow-x-auto bg-white rounded-2xl shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-cream2 text-gray-600">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Status</th>
                <th className="p-3">Tempo restante</th>
                <th className="p-3">Nome</th>
                <th className="p-3">Data</th>
                <th className="p-3">Horário</th>
                <th className="p-3">Modalidade</th>
                <th className="p-3">WhatsApp</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="p-3 font-mono">{b.publicId}</td>
                  <td className="p-3">{STATUS_LABELS[b.status] || b.status}</td>
                  <td className="p-3">
                    {b.status === "PENDING_PAYMENT" ? formatTempoRestante(b.expiresAt, now) : "—"}
                  </td>
                  <td className="p-3">{b.nome}</td>
                  <td className="p-3">{b.data}</td>
                  <td className="p-3">{b.horario}</td>
                  <td className="p-3">{MODALIDADE_LABELS[b.modalidade] || b.modalidade}</td>
                  <td className="p-3">{b.whatsapp}</td>
                  <td className="p-3">{b.email}</td>
                  <td className="p-3 space-y-1">
                    {b.status === "PENDING_PAYMENT" && (
                      <>
                        <button
                          onClick={() => handleAction(b.id, "confirmar")}
                          disabled={Boolean(actionState[b.id])}
                          className="block w-full bg-navy text-white text-xs font-semibold rounded-lg px-2 py-1.5 disabled:opacity-60"
                        >
                          {actionState[b.id] === "confirmar" ? "Confirmando…" : "Confirmar sinal recebido"}
                        </button>
                        <button
                          onClick={() => handleAction(b.id, "rejeitar")}
                          disabled={Boolean(actionState[b.id])}
                          className="block w-full bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg px-2 py-1.5 disabled:opacity-60"
                        >
                          {actionState[b.id] === "rejeitar" ? "Marcando…" : "Pagamento não identificado"}
                        </button>
                      </>
                    )}
                    {b.status === "CONFIRMED" && <span className="text-xs text-green-700">Evento criado ✅</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
