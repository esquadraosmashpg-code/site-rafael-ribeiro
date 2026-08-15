# Site — Rafael Ribeiro Hipnoterapeuta

Recepção Inteligente: site institucional + Secretária Virtual (pré-atendimento guiado) para o consultório do Dr. Rafael. Construído pela Smash Mídias.

## Stack (100% gratuito para rodar a V1)

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** (paleta da marca definida em `app/globals.css`)
- Sem backend/banco de dados nesta fase — a Secretária Virtual roda inteiramente no navegador (fluxo guiado, sem custo de IA)
- Deploy gratuito: **Vercel** (free tier) conectado a um repositório **GitHub** (gratuito)

## Rodando localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Estrutura (pensada para white-label)

```
config/content.js       -> TODO o texto do site + arrays (áreas de atuação, FAQ, fluxo do chat)
app/globals.css          -> paleta de cores (variáveis --color-navy, --color-gold, etc.)
public/rafael-photo.jpg   -> foto principal
components/               -> Nav, Hero, Sobre, HipnoterapiaSteps, ParaQuemCards,
                             Timeline, SecretariaCTA, Faq, Footer, ChatWidget
```

Para adaptar este site a **outro profissional** (produto white-label da Smash Mídias):
1. Troque `config/content.js` (textos, áreas de atuação, FAQ, perguntas do chat)
2. Troque as cores em `app/globals.css` (`@theme inline`)
3. Troque a foto em `public/rafael-photo.jpg`
4. Ajuste `site.whatsappNumero` em `config/content.js`

## Deploy gratuito (GitHub + Vercel)

1. Crie um repositório no GitHub (pode ser privado, é gratuito) e suba este projeto:
   ```bash
   git remote add origin <URL_DO_SEU_REPO>
   git branch -M main
   git push -u origin main
   ```
2. Entre em vercel.com, conecte sua conta GitHub, importe este repositório.
3. A Vercel detecta Next.js automaticamente — não precisa configurar nada.
4. Cada `git push` na branch `main` atualiza o site no ar automaticamente.

## Pendências antes de publicar em produção

- **Variáveis do Google Calendar**: preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID` e `GOOGLE_REFRESH_TOKEN` na Vercel (ver `.env.example` e a seção "Agenda própria" abaixo) — sem isso `/agendar` não consegue consultar nem criar eventos.
- **Endereço presencial**: trocar o placeholder em `config/booking.js` (`presencial.endereco` / `presencial.instrucoes`) pelo endereço real do consultório.
- **Prova social sensível**: NÃO publicar a alegação de "já ajudei pessoas que tentaram suicídio" sem reescrita — ver nota de compliance na proposta estratégica (v3) e em `config/content.js`.
- **Revisão jurídica/LGPD**: recomendado antes do lançamento oficial, dado que o site coleta dados de saúde (dado sensível).
- **Redação comercial (sinal, remarcação, política de "A análise")**: o texto em `config/content.js#analise` (valores, sinal, saldo, política de remarcação de 48h, "não admite cancelamento") reflete o que o Rafael confirmou operacionalmente, mas **ainda não passou por validação jurídica**. Recomenda-se revisão por advogado antes da divulgação definitiva — mesma recomendação já feita para as páginas legais em `components/LegalPage.js`.
- **Reserva/Pix/painel administrativo**: preencher `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_ADMIN_PASSWORD`, `BOOKING_ADMIN_SESSION_SECRET`, `BOOKING_PIX_KEY` e `BOOKING_PIX_RECEIVER` na Vercel (ver seção "Reserva provisória com Pix" abaixo) — sem isso, `/api/agendar/reservar` responde 503 e a tela de reserva nunca mostra uma chave Pix falsa. O número de WhatsApp usado no botão "Enviar comprovante" **não** vem mais de variável de ambiente — vem de `site.whatsappNumero` em `config/content.js` (mesma fonte usada pelo rodapé e pela Secretária Virtual).

## Agenda própria (`/agendar`)

Substitui o Cal.com de teste. Regras de horário/duração/antecedência ficam em `config/booking.js`
(um lugar só, fácil de ajustar). Integração com o Google Calendar via `fetch` puro (sem a lib
`googleapis`, para manter o bundle leve) em `lib/google/`.

**Gerando o `GOOGLE_REFRESH_TOKEN` (fluxo oficial — sempre em produção, nunca localhost):**

O redirect autorizado no Google Cloud é `https://site-rafael-ribeiro.vercel.app/api/google/callback` —
ou seja, o Google só consegue voltar pra Vercel, nunca pra `localhost`. Por isso o fluxo oficial desta
implantação roda inteiro em produção, com as rotas OAuth desativadas por padrão fora da janela de
autorização:

1. Publique o código com as rotas OAuth desativadas por padrão (é o comportamento padrão — elas só
   ligam com `GOOGLE_OAUTH_SETUP_ENABLED=true`).
2. Cadastre na Vercel (Settings → Environment Variables):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALENDAR_ID`
   - `GOOGLE_REDIRECT_URI=https://site-rafael-ribeiro.vercel.app/api/google/callback`
   - `GOOGLE_TIMEZONE=America/Sao_Paulo`
   - `GOOGLE_OAUTH_SETUP_ENABLED=true` — **só temporariamente**, pra essa janela de autorização
3. Faça um redeploy (Vercel → Deployments → Redeploy, ou um novo `git push`).
4. Abra `https://site-rafael-ribeiro.vercel.app/api/google/authorize`.
5. Autorize com a conta Google dona da agenda (o usuário de teste já cadastrado no projeto OAuth).
6. A página de callback mostra o `refresh_token` **uma única vez** — copie na hora, ele não fica
   salvo em nenhum lugar do projeto (nem log, nem cookie, nem arquivo).
7. Cole esse valor em `GOOGLE_REFRESH_TOKEN` nas Environment Variables da Vercel (nunca no código,
   nunca no Git).
8. Remova `GOOGLE_OAUTH_SETUP_ENABLED` (ou deixe com valor diferente de `"true"`, ex.: `"false"`).
9. Faça um novo redeploy e confirme que `/api/google/authorize` e `/api/google/callback` voltam a
   responder 404 — as rotas administrativas ficam bloqueadas de novo até a próxima vez que precisar
   gerar um refresh token (ex.: se revogar o acesso e precisar reautorizar).

## Reserva provisória com Pix + confirmação manual

Regra comercial definitiva (confirmada pelo Rafael): o agendamento nunca é confirmado
automaticamente. Ao concluir os dados em `/agendar`, o paciente recebe uma **reserva
provisória de 30 minutos** (não um agendamento confirmado) — envia o comprovante do sinal
pelo WhatsApp, e o Dr. Rafael confirma manualmente em `/admin/agendamentos`. Só depois
dessa confirmação um evento é criado no Google Calendar (com Google Meet e convite).

**Arquitetura, em uma frase**: o Supabase Postgres é a autoridade das reservas (não a
memória da Vercel), e não existe cron nenhum — uma reserva "vencida" (`PENDING_PAYMENT`
com `expires_at` no passado) é tratada como expirada sempre que alguém consulta o banco
(view `active_bookings`), mesmo que a linha continue gravada até alguém decidir limpar.

### Configurando o Supabase (free tier)

1. Crie um projeto gratuito em [supabase.com](https://supabase.com) (não pede cartão).
2. No projeto, vá em **SQL Editor → New query**, cole o conteúdo INTEIRO de
   `supabase/migrations/0001_create_bookings.sql` e rode (**Run**). O arquivo é
   idempotente (`create ... if not exists` / `create or replace`) — pode rodar de novo
   sem quebrar nada se precisar reaplicar.
3. Em **Settings → API**, copie a **Project URL** (`SUPABASE_URL`) e a **service_role
   key** (`SUPABASE_SERVICE_ROLE_KEY`, NUNCA a `anon` key — a `service_role` é a única
   que o backend deste projeto usa, e nunca deve ter o prefixo `NEXT_PUBLIC_`).
4. Preencha as duas variáveis no `.env.local` (local) ou nas Environment Variables da
   Vercel (produção) — nunca no código, nunca no Git.

O acesso ao Supabase é sempre via `fetch` puro para a REST/RPC API do PostgREST
(`lib/supabase/client.js`) — sem o SDK `@supabase/supabase-js`, pelo mesmo motivo de já
não usarmos a lib `googleapis` para o Google Calendar: menos dependência pesada, mais
fácil de auditar. O navegador nunca fala com o Supabase diretamente; toda leitura/escrita
passa pelas rotas server-side deste projeto.

### Testando contra um Supabase real (`npm run test:supabase`)

A suíte `npm test` roda 100% offline (fetch mockado) — ela prova consistência estrutural
da migration e do código, mas **não** é um teste de integração contra um Postgres de
verdade. Para isso existe um script separado, que só roda sob demanda:

1. Aplique a migration num projeto Supabase (ver "Configurando o Supabase" acima) — pode
   ser o mesmo projeto de desenvolvimento, não precisa ser o de produção.
2. Crie um arquivo `.env.local` na raiz do projeto (esse arquivo **nunca é commitado** —
   já está no `.gitignore` — e **nunca deve ser commitado manualmente**) com:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=a-sua-service-role-key
   ```
3. Rode:
   ```bash
   npm run test:supabase
   ```

O script (`scripts/verify-supabase-bookings.mjs` — nomeado "verify-", não "test-", de
propósito: um nome começando com "test-" é capturado pela descoberta automática de
arquivos de teste do `node --test` em qualquer pasta do projeto, e esse script NUNCA deve
rodar como parte de `npm test`) usa o **mesmo código** que a aplicação usa
em produção (`lib/booking/bookingRepository.js`), com dados 100% fictícios (nome "TESTE
INTEGRACAO", e-mail no domínio reservado `.invalid` — nunca resolve de verdade) e horários
isolados no ano 2099. Ele verifica, contra o Postgres real: criação de reserva, idempotência
(mesma chave+assinatura reaproveita, chave+assinatura diferente gera conflito), duas
criações concorrentes pro mesmo horário, todos os 6 estados bloqueando/liberando
corretamente (inclusive `CONFIRMING`/`CONFIRMED`/`UNKNOWN` continuando a bloquear mesmo
depois do prazo original de 30min vencer), as guardas de `begin_confirmation`, duas
confirmações concorrentes, e que requisições sem nenhuma credencial são recusadas. Ao
final, remove só as reservas fictícias criadas por essa própria execução (rastreadas por
id em memória) e nunca imprime a URL do projeto, a chave, headers ou qualquer dado
pessoal — se as duas variáveis não estiverem configuradas, o script encerra com uma
instrução genérica, sem erro confuso.

**Nunca use a `SUPABASE_SERVICE_ROLE_KEY` no navegador** — ela ignora RLS e dá acesso
total ao banco; é por isso que este projeto só a lê em código server-side (rotas
`app/api/*` e este script, que só roda no terminal). **Nunca commite `.env.local`** — ele
já está no `.gitignore`, mas vale checar `git status` antes de qualquer commit se algum
dia editar esse arquivo.

#### Verificação manual opcional (anon/authenticated)

O script automatizado só lê `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (por instrução
explícita) — ele prova que requisições **sem nenhuma credencial** são recusadas, mas não
prova especificamente que os papéis `anon`/`authenticated` (usando a própria `anon key`
deles) são bloqueados pelo `REVOKE`/RLS da migration. Para fechar essa lacuna manualmente
(nunca salve a `anon key` em arquivo — só copie do painel do Supabase, use no terminal, e
descarte):

```bash
# Deve responder 401/403 (RLS sem policy pública) -- SELECT direto na tabela com a anon key:
curl -s -o /dev/null -w "%{http_code}\n" \
  "$SUPABASE_URL/rest/v1/bookings?select=id&limit=1" \
  -H "apikey: $SUA_ANON_KEY_COLADA_AQUI"

# Deve responder 401/403 (EXECUTE revogado de anon) -- chamar uma RPC protegida com a anon key:
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/rest/v1/rpc/create_booking" \
  -H "apikey: $SUA_ANON_KEY_COLADA_AQUI" -H "Content-Type: application/json" -d '{}'
```

### Sem cron: como a expiração de 30 minutos funciona

Não existe nenhuma rotina agendada apagando ou atualizando reservas vencidas (isso exigiria
um serviço de cron, geralmente pago em plataformas serverless gratuitas). Em vez disso:

- Cada reserva grava seu próprio `expires_at` no momento da criação.
- A view `active_bookings` (na migration) já filtra `expires_at > now()` toda vez que é
  consultada — então uma reserva vencida simplesmente para de "contar" como ativa
  (disponibilidade, painel admin, confirmação) no instante em que alguém consulta o banco,
  sem precisar de nenhum processo em segundo plano.
- A linha em si continua gravada na tabela `bookings` (com `status = 'PENDING_PAYMENT'`
  e `expires_at` no passado) até alguém decidir limpar manualmente — ver a seção de
  limpeza futura abaixo.

### Painel administrativo

`/admin/agendamentos` — login por senha (`BOOKING_ADMIN_PASSWORD`), sessão em cookie
`HttpOnly`/`Secure` (em produção)/`SameSite=Strict` assinado com HMAC-SHA256
(`BOOKING_ADMIN_SESSION_SECRET`), sem tabela de sessão nenhuma (fica dentro do orçamento
gratuito). Lista reservas aguardando pagamento com tempo restante, e permite **Confirmar
sinal recebido** (cria o evento no Google Calendar) ou **Marcar pagamento não
identificado**.

### Escopo das variáveis sensíveis na Vercel (Production vs. Preview)

A Vercel permite marcar cada Environment Variable como disponível em `Production`,
`Preview` e/ou `Development` (checkboxes separados na hora de cadastrar). **Recomendação
para as 5 variáveis mais sensíveis deste projeto:**

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `BOOKING_ADMIN_PASSWORD`
- `BOOKING_ADMIN_SESSION_SECRET`

**Marcar só `Production`** para essas 5 — **não** marcar `Preview`. Deployments de Preview
(criados automaticamente a cada PR/branch) são acessíveis por URL pública e não deveriam
ter as mesmas credenciais que o site real. As demais variáveis (Pix, WhatsApp,
`SUPABASE_URL`, IDs não-secretos) podem ficar em `Production` e `Preview` sem o mesmo
risco. Em ambiente local, todas continuam vivendo só em `.env.local` — nunca na Vercel
"Development".

### Backup/limpeza de registros vencidos (não implementado nesta fase)

Como não há cron nem serviço pago, linhas com status terminal (`EXPIRED`,
`PAYMENT_REJECTED`) continuam na tabela indefinidamente. Para o volume esperado (poucas
reservas por dia), isso não é um problema imediato de custo/performance no Supabase Free.
Se o volume crescer no futuro, um candidato (ainda **não implementado**) seria uma rotina
manual/periódica pelo SQL Editor exportando e apagando linhas terminais mais antigas que
alguns meses — sem introduzir nenhum serviço de cron pago.

## Roadmap técnico

- **Fase 1 (este código)**: fluxo guiado da Secretária Virtual, sem custo de IA.
- **Fase 2**: trocar a lógica de `ChatWidget.js` por uma chamada a um LLM (ex: Claude), mantendo o mesmo protocolo de segurança para risco (ideação suicida) já implementado.
- **Fase 3**: banco de dados (Supabase, free tier) para persistir pré-atendimentos, e integração real de agenda/WhatsApp Business API.
