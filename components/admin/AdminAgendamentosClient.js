"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { unlockAlertSound, playAlertBeep, closeAlertSound } from "@/lib/admin/alertSound";

const STATUS_LABELS = {
  PENDING_PAYMENT: "Aguardando pagamento",
  CONFIRMING: "Confirmando…",
  CONFIRMED: "Confirmado",
  EXPIRED: "Expirado",
  PAYMENT_REJECTED: "Pagamento não identificado",
  UNKNOWN: "Indefinido — verificar manualmente",
};

const MODALIDADE_LABELS = { online: "Online", presencial: "Presencial" };

// Painel atualiza sozinho a cada 30s -- só enquanto autenticado E com a
// aba visível (ver useEffect de polling abaixo). Não é tráfego público,
// é uma única sessão administrativa -- carga real no Supabase é
// desprezível.
const POLL_INTERVAL_MS = 30_000;
const TITLE_ORIGINAL = "Painel administrativo — Agendamentos";
const TITLE_ALERTA = "🔔 Nova reserva! — Agendamentos";

function formatTempoRestante(expiresAtISO, now) {
  const diffMs = new Date(expiresAtISO).getTime() - now;
  if (diffMs <= 0) return "expirado";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Mensagem do alerta -- de PROPÓSITO nunca recebe a reserva inteira,
// só uma contagem. Nunca deveria ser possível vazar nome/telefone/e-mail
// do paciente pro banner, pro título da aba ou pra notificação nativa
// (essas três coisas podem ficar visíveis fora do contexto autenticado
// do painel -- ex.: notificação do sistema aparece na tela de bloqueio
// do celular). Os dados pessoais continuam só dentro da tabela, que
// exige sessão administrativa válida.
function mensagemAlerta(quantidade) {
  return quantidade === 1 ? "Nova reserva aguardando pagamento" : `${quantidade} novas reservas aguardando pagamento`;
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

  // Alertas (som + notificação do navegador) -- desligados até o Rafael
  // clicar em "Ativar alertas" pelo menos uma vez nesta sessão da
  // página. É a política de autoplay dos navegadores: som só pode ser
  // destravado por um gesto real de clique, nunca programaticamente.
  const [alertasAtivos, setAlertasAtivos] = useState(false);
  const [notificacaoPermissao, setNotificacaoPermissao] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [bannerNovaReserva, setBannerNovaReserva] = useState(null); // texto curto ou null
  const [instalarPromptEvent, setInstalarPromptEvent] = useState(null);

  // Conjunto de TODOS os ids de reserva já vistos alguma vez (qualquer
  // status), desde a primeira carga autenticada -- nunca diminui, só
  // cresce (união a cada busca). É assim que garantimos "cada reserva
  // alerta só uma vez": mesmo que uma reserva mude de status e volte
  // (ex.: PENDING_PAYMENT -> CONFIRMING -> volta pra PENDING_PAYMENT
  // numa falha de confirmação), o id dela já está aqui e nunca mais
  // conta como "nova". Começa null de propósito: a primeira carga só
  // registra a baseline, nunca alerta. Nunca é salvo em
  // localStorage/sessionStorage -- vive só na memória desta sessão da
  // página, e é reiniciado (null) no logout.
  const idsConhecidosRef = useRef(null);
  const titleFlashTimerRef = useRef(null);
  // Trava de concorrência -- nunca deixa duas buscas rodarem ao mesmo
  // tempo (ex.: o poll de 30s disparando enquanto uma busca anterior
  // ainda não voltou, ou o usuário clicando "Atualizar" no meio de um
  // poll silencioso).
  const buscaEmAndamentoRef = useRef(false);

  function iniciarPiscaTitulo() {
    if (titleFlashTimerRef.current) return; // já piscando
    let visivel = true;
    titleFlashTimerRef.current = setInterval(() => {
      document.title = visivel ? TITLE_ALERTA : TITLE_ORIGINAL;
      visivel = !visivel;
    }, 1000);
  }

  function pararPiscaTitulo() {
    if (titleFlashTimerRef.current) {
      clearInterval(titleFlashTimerRef.current);
      titleFlashTimerRef.current = null;
    }
    document.title = TITLE_ORIGINAL;
  }

  // Dispara os 3 canais de alerta -- UM conjunto de bipes por rodada
  // que encontrar reserva(s) nova(s), nunca um bipe por reserva
  // individual. `quantidade` é só um número -- nunca um objeto de
  // reserva -- exatamente pra tornar estruturalmente impossível vazar
  // PII por aqui.
  function dispararAlertaNovaReserva(quantidade) {
    const texto = mensagemAlerta(quantidade);

    // 1) Alerta visual dentro do próprio painel -- sempre, independente
    //    de som/notificação estarem ativos.
    setBannerNovaReserva(texto);

    // 2) Som -- só se o Rafael já destravou o áudio nesta sessão. Se
    //    estiver desligado (ou a permissão de notificação tiver sido
    //    negada), o alerta visual acima continua funcionando de
    //    qualquer jeito.
    if (alertasAtivos) playAlertBeep();

    // 3) Notificação do navegador -- só com permissão concedida.
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Painel de agendamentos", { body: texto, tag: "nova-reserva" });
      } catch {
        // Alguns navegadores/PWAs exigem Service Worker pra notificação
        // -- se falhar, o alerta visual e o som já cobriram o aviso.
      }
    }

    // 4) Título da aba pisca até o Rafael voltar a olhar pra essa aba --
    //    ajuda quando o painel está minimizado/numa aba em segundo plano.
    iniciarPiscaTitulo();
  }

  // `silencioso: true` é usado pelo poll automático e pelas atualizações
  // disparadas por foco/visibilidade -- NUNCA mexe em listLoading/listError,
  // pra nunca piscar "Carregando reservas…" nem a tabela por causa de
  // uma atualização em segundo plano que o Rafael nem pediu. O botão
  // "Atualizar" e a carga inicial continuam mostrando o loading normal.
  const carregarLista = useCallback(async ({ silencioso = false } = {}) => {
    if (buscaEmAndamentoRef.current) return; // nunca duas buscas ao mesmo tempo
    buscaEmAndamentoRef.current = true;
    if (!silencioso) {
      setListLoading(true);
      setListError(null);
    }
    try {
      const res = await fetch("/api/admin/agendamentos", { cache: "no-store" });
      if (res.status === 401) {
        setAuthState("anon");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!silencioso) setListError(data?.error || "Não foi possível carregar as reservas.");
        return;
      }
      const novasBookings = data.bookings || [];

      // Detecção de reserva nova -- ver comentário de idsConhecidosRef
      // acima pra entender por que é uma união monotônica (nunca remove
      // ids), não um conjunto que reflete só o status atual.
      const idsAtuais = new Set(novasBookings.map((b) => b.id));
      if (idsConhecidosRef.current !== null) {
        const novasChegadas = novasBookings.filter(
          (b) => b.status === "PENDING_PAYMENT" && !idsConhecidosRef.current.has(b.id)
        );
        if (novasChegadas.length > 0) {
          dispararAlertaNovaReserva(novasChegadas.length);
        }
        idsConhecidosRef.current = new Set([...idsConhecidosRef.current, ...idsAtuais]);
      } else {
        // Primeira carga autenticada -- só cria a baseline, nunca alerta.
        idsConhecidosRef.current = idsAtuais;
      }

      setBookings(novasBookings);
      setAuthState("authed");
    } catch {
      if (!silencioso) setListError("Erro de conexão ao carregar as reservas.");
    } finally {
      if (!silencioso) setListLoading(false);
      buscaEmAndamentoRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertasAtivos]);

  // Para de piscar o título assim que o Rafael volta a prestar atenção
  // na aba -- não precisa continuar chamando atenção depois que ele já
  // viu.
  useEffect(() => {
    function aoFocar() {
      pararPiscaTitulo();
    }
    function aoMudarVisibilidadeTitulo() {
      if (document.visibilityState === "visible") pararPiscaTitulo();
    }
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoMudarVisibilidadeTitulo);
    return () => {
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidadeTitulo);
      pararPiscaTitulo();
    };
  }, []);

  // Libera o AudioContext quando o painel é desmontado (ex.: navegação
  // pra outra página) -- nunca deixa recurso de áudio aberto sem dono.
  useEffect(() => {
    return () => closeAlertSound();
  }, []);

  // Captura o evento nativo de instalação (só dispara em
  // Chrome/Android/desktop com os critérios de instalabilidade
  // atendidos -- nunca no Safari/iOS, que não tem esse evento). Guardado
  // aqui pra virar o botão "Instalar no celular"; se nunca disparar, a
  // interface mostra as instruções manuais no lugar (ver JSX abaixo).
  useEffect(() => {
    function aoTerPromptDisponivel(e) {
      e.preventDefault();
      setInstalarPromptEvent(e);
    }
    window.addEventListener("beforeinstallprompt", aoTerPromptDisponivel);
    return () => window.removeEventListener("beforeinstallprompt", aoTerPromptDisponivel);
  }, []);

  function handleAtivarAlertas() {
    const ok = unlockAlertSound();
    setAlertasAtivos(ok);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(setNotificacaoPermissao);
    }
    // Toca um bipe de confirmação na hora -- feedback imediato de que
    // funcionou, sem precisar esperar a próxima reserva de verdade pra
    // descobrir se o som está ligado.
    if (ok) playAlertBeep();
  }

  async function handleInstalar() {
    if (!instalarPromptEvent) return;
    instalarPromptEvent.prompt();
    try {
      await instalarPromptEvent.userChoice;
    } catch {
      // ignora -- o usuário só fechou o prompt sem escolher
    }
    setInstalarPromptEvent(null);
  }

  useEffect(() => {
    // Busca disparada por mudança de dependência (montagem do painel) --
    // caso legítimo de efeito + setState (carregarLista atualiza vários
    // estados internamente conforme o resultado do fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarLista();
  }, [carregarLista]);

  // Atualização automática -- só roda enquanto autenticado E com a aba
  // visível. Pausa o intervalo assim que a aba fica oculta (poupa
  // rede/bateria no celular) e retoma + busca imediatamente assim que a
  // aba volta a ficar visível ou a janela ganha foco -- pra nunca ficar
  // com dado desatualizado só porque o Rafael trocou de aba um
  // instante.
  useEffect(() => {
    if (authState !== "authed") return undefined;

    let intervalId = null;
    function iniciarIntervalo() {
      if (intervalId) return;
      intervalId = setInterval(() => carregarLista({ silencioso: true }), POLL_INTERVAL_MS);
    }
    function pararIntervalo() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function aoMudarVisibilidadePolling() {
      if (document.visibilityState === "visible") {
        carregarLista({ silencioso: true });
        iniciarIntervalo();
      } else {
        pararIntervalo();
      }
    }
    function aoFocarPolling() {
      carregarLista({ silencioso: true });
    }

    if (document.visibilityState === "visible") iniciarIntervalo();
    document.addEventListener("visibilitychange", aoMudarVisibilidadePolling);
    window.addEventListener("focus", aoFocarPolling);

    return () => {
      pararIntervalo();
      document.removeEventListener("visibilitychange", aoMudarVisibilidadePolling);
      window.removeEventListener("focus", aoFocarPolling);
    };
  }, [authState, carregarLista]);

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
      // Reinicia a baseline -- um novo login recomeça do zero, nunca
      // alerta reservas que já existiam antes desse logout.
      idsConhecidosRef.current = null;
      pararPiscaTitulo();
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
        {bannerNovaReserva && (
          <div className="bg-gold/20 border border-gold rounded-2xl p-3 flex items-center justify-between gap-3 text-sm text-navy">
            <span>🔔 {bannerNovaReserva}</span>
            <button onClick={() => setBannerNovaReserva(null)} className="text-xs underline shrink-0">
              Dispensar
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-serif text-navy">Agendamentos — reservas</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-500">Atualiza sozinho a cada 30s</span>
            {!alertasAtivos && (
              <button
                onClick={handleAtivarAlertas}
                className="text-xs bg-navy text-white font-semibold rounded-lg px-3 py-1.5"
              >
                🔔 Ativar alertas sonoros
              </button>
            )}
            {alertasAtivos && <span className="text-xs text-green-700">🔔 Alertas sonoros ativos</span>}
            <button onClick={() => carregarLista()} className="text-sm text-navy underline">
              Atualizar
            </button>
            <button onClick={handleLogout} className="text-sm text-red-600 underline">
              Sair
            </button>
          </div>
        </div>

        <div className="bg-cream2 border border-gray-200 rounded-2xl p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-navy">Os alertas funcionam enquanto este painel estiver aberto.</p>
          <p>
            <b>Painel aberto</b> (esta aba em foco ou visível): atualização automática, banner, som e notificação do
            navegador, todos disponíveis.
          </p>
          <p>
            <b>Painel minimizado</b> (outra aba/janela na frente): pode continuar funcionando, mas isso depende do
            navegador e das restrições de economia de bateria do aparelho -- não é garantido.
          </p>
          <p>
            <b>Painel fechado ou celular desligado/reiniciado:</b> nenhum alerta é recebido. Reservas novas só
            aparecem quando o painel é aberto de novo e busca os dados atualizados.
          </p>
          <p>
            O atalho na tela inicial só deixa mais rápido abrir o painel -- ele não fica rodando sozinho em segundo
            plano. Esta versão não usa notificação push (que exigiria manter uma inscrição de push ativa e um
            serviço rodando em segundo plano); isso pode ser adicionado depois, se for necessário.
          </p>
        </div>

        {notificacaoPermissao === "denied" && (
          <p className="text-xs text-gray-500">
            Notificações do navegador estão bloqueadas para este site. O alerta sonoro e o aviso dentro do painel
            continuam funcionando normalmente enquanto o painel estiver aberto.
          </p>
        )}

        {/* Atalho de celular -- instalação/atalho na tela inicial. */}
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-xs text-gray-600 space-y-2">
          {instalarPromptEvent ? (
            <button onClick={handleInstalar} className="bg-navy text-white font-semibold rounded-lg px-3 py-1.5">
              📲 Instalar no celular
            </button>
          ) : (
            <>
              <p className="font-semibold text-navy">Adicionar este painel à tela inicial do celular:</p>
              <p>
                <b>Android/Chrome:</b> menu (⋮) → &ldquo;Adicionar à tela inicial&rdquo; ou &ldquo;Instalar
                app&rdquo;.
              </p>
              <p>
                <b>iPhone/Safari:</b> botão Compartilhar → &ldquo;Adicionar à Tela de Início&rdquo;.
              </p>
            </>
          )}
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
