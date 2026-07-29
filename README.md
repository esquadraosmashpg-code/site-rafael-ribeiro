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
- **Agendamento real**: o botão "Agendar agora" hoje é um placeholder (`alert`). Integrar com Google Calendar API ou Cal.com (gratuito) é o próximo passo natural — ver Fase 1→2 da proposta estratégica.
- **Prova social sensível**: NÃO publicar a alegação de "já ajudei pessoas que tentaram suicídio" sem reescrita — ver nota de compliance na proposta estratégica (v3) e em `config/content.js`.
- **Revisão jurídica/LGPD**: recomendado antes do lançamento oficial, dado que o site coleta dados de saúde (dado sensível).

## Roadmap técnico

- **Fase 1 (este código)**: fluxo guiado da Secretária Virtual, sem custo de IA.
- **Fase 2**: trocar a lógica de `ChatWidget.js` por uma chamada a um LLM (ex: Claude), mantendo o mesmo protocolo de segurança para risco (ideação suicida) já implementado.
- **Fase 3**: banco de dados (Supabase, free tier) para persistir pré-atendimentos, e integração real de agenda/WhatsApp Business API.
