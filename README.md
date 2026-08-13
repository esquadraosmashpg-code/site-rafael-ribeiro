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

- **Número de WhatsApp**: definir `site.whatsappNumero` em `config/content.js` (hoje está com placeholder).
- **Variáveis do Google Calendar**: preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID` e `GOOGLE_REFRESH_TOKEN` na Vercel (ver `.env.example` e a seção "Agenda própria" abaixo) — sem isso `/agendar` não consegue consultar nem criar eventos.
- **Endereço presencial**: trocar o placeholder em `config/booking.js` (`presencial.endereco` / `presencial.instrucoes`) pelo endereço real do consultório.
- **Prova social sensível**: NÃO publicar a alegação de "já ajudei pessoas que tentaram suicídio" sem reescrita — ver nota de compliance na proposta estratégica (v3) e em `config/content.js`.
- **Revisão jurídica/LGPD**: recomendado antes do lançamento oficial, dado que o site coleta dados de saúde (dado sensível).

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

## Roadmap técnico

- **Fase 1 (este código)**: fluxo guiado da Secretária Virtual, sem custo de IA.
- **Fase 2**: trocar a lógica de `ChatWidget.js` por uma chamada a um LLM (ex: Claude), mantendo o mesmo protocolo de segurança para risco (ideação suicida) já implementado.
- **Fase 3**: banco de dados (Supabase, free tier) para persistir pré-atendimentos, e integração real de agenda/WhatsApp Business API.
