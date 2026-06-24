# Add-on: WhatsApp CRM (Kanban + Inbox + Flows)

Novo add-on **"WhatsApp CRM"** que se ativa em cima do add-on WhatsApp já existente. Quando um lead responde uma mensagem enviada pelo usuário, automaticamente abre uma conversa em um pipeline estilo Kanban, com inbox tipo WhatsApp Web, banco de respostas rápidas, mídias, botões e fluxos automáticos.

## 1. Visão geral

```text
Lead responde ───► Webhook Evolution ───► Conversa criada/atualizada
                                              │
                                              ▼
                          ┌──────────── Inbox + Kanban ────────────┐
                          │ • Conversas no estágio "Novo"          │
                          │ • Drag-and-drop entre estágios         │
                          │ • Respostas rápidas (snippets)         │
                          │ • Mídias, áudio, botões interativos    │
                          │ • Fluxos: gatilho → passos automáticos │
                          └────────────────────────────────────────┘
```

## 2. Modelo de dados (novas tabelas)

```text
crm_pipelines          pipelines (Kanban) por usuário
  id, user_id, name, is_default

crm_stages             colunas do Kanban
  id, pipeline_id, name, color, sort_order, is_won, is_lost

crm_conversations      uma conversa = um lead falando com o usuário
  id, user_id, pipeline_id, stage_id, phone, contact_name,
  lead_id (search_results), assigned_to, last_message_at,
  unread_count, tags[], status (open|closed|snoozed),
  snoozed_until, created_at

crm_messages           timeline de cada conversa
  id, conversation_id, user_id, direction (in|out),
  type (text|image|audio|video|document|button|template|note),
  body, media_url, media_mime, media_filename, duration_ms,
  buttons jsonb, status (queued|sent|delivered|read|failed),
  evolution_message_id, replied_to_id, created_at

crm_quick_replies      banco de respostas rápidas
  id, user_id, shortcut (/preco), title, body, attachments jsonb,
  tags_used[], sort_order

crm_flows              fluxos automáticos
  id, user_id, name, is_active, trigger jsonb,
  steps jsonb  -- array de passos
  -- gatilhos: first_inbound, keyword, stage_changed, no_reply_after
  -- passos: send_message | wait | move_stage | add_tag | end |
  --         send_media | send_buttons | branch_on_reply

crm_flow_runs          execuções em andamento
  id, flow_id, conversation_id, current_step_index,
  status (running|completed|paused|failed), next_run_at,
  context jsonb

crm_contacts           ficha do lead (enriquecimento próprio)
  id, user_id, phone, name, email, company, notes,
  custom_fields jsonb, lead_id

addons                 NOVO registro: slug='whatsapp_crm', R$ 99/mês
```

RLS: tudo por `auth.uid()`. GRANTs padrão. Índices em `(user_id, last_message_at desc)` e `(conversation_id, created_at)`.

Realtime habilitado em `crm_conversations` e `crm_messages` para atualização ao vivo.

## 3. Edge functions

| Função | Papel |
|---|---|
| `evolution-webhook` | Receptor público (`verify_jwt=false`). Recebe eventos `messages.upsert`/`connection.update` da Evolution, identifica o usuário pela instância, cria/atualiza conversa, salva mensagem inbound, decrementa nada da cota, dispara fluxos com gatilho `first_inbound` ou `keyword`. |
| `crm-send` | Envia text/image/audio/document/buttons usando a Evolution (`/message/sendText`, `/sendMedia`, `/sendWhatsAppAudio`, `/sendButtons`). Faz upload da mídia para o bucket `crm-media` e devolve a URL. Decrementa cota. |
| `crm-flow-run` | Executor de fluxo: lê o próximo passo, executa (envia msg, aguarda, move stage, etc.), agenda próximo passo via cron. |
| `crm-cron` (pg_cron 1min) | Lê `crm_flow_runs` com `next_run_at <= now()` e chama `crm-flow-run` para cada um. Também processa `snoozed_until` em conversas. |
| `whatsapp-user` (existente) | Estendido para configurar webhook da Evolution apontando para `evolution-webhook` durante o `create`. |

## 4. Storage

Bucket privado **`crm-media`** com path `{user_id}/{conversation_id}/{uuid}.{ext}`. RLS permite o dono ler/escrever; arquivos enviados aos leads viram URL pública assinada de curta duração antes da entrega para a Evolution.

## 5. Telas (sidebar: "WhatsApp CRM" abaixo de WhatsApp)

### 5.1 Inbox + Kanban (rota `addon-crm`)

Layout em três colunas:

```text
┌────────────┬─────────────────────────┬─────────────────┐
│ Conversas  │   Conversa selecionada  │ Painel do lead  │
│ (filtros,  │   timeline + composer   │ (ficha, tags,   │
│ unread,    │                         │ histórico,      │
│ etiquetas) │                         │ campos custom)  │
└────────────┴─────────────────────────┴─────────────────┘
```

Toggle no topo: **Inbox** (vista lista) ⇄ **Kanban** (vista colunas com cards arrastáveis entre estágios via `@dnd-kit`).

### 5.2 Composer

Composer tipo WhatsApp:
- Texto + emoji.
- Botão **anexar** → imagem, documento (pdf/docx/xlsx), áudio.
- Botão **gravar áudio** (MediaRecorder → webm/ogg) com waveform.
- Botão **respostas rápidas** (`/` abre o picker, busca por shortcut/título).
- Botão **botões interativos** (até 3 — texto e ID).
- Botão **template** (insere template do add-on WhatsApp e renderiza tags).
- Botão **agendar envio** (envio com delay).
- Botão **nota interna** (não envia, só fica visível no time).

### 5.3 Kanban

- Estágios padrão criados na ativação: **Novo · Em qualificação · Proposta · Negociação · Ganho · Perdido**.
- Drag-and-drop entre colunas atualiza `stage_id`.
- Cada card mostra: nome, snippet da última mensagem, tempo, badge unread, tags.
- Estágios configuráveis (criar/renomear/ordenar/cor).

### 5.4 Respostas rápidas (tab)

CRUD com shortcut `/preco`, título, corpo (com tags `{{nome}}` etc.), anexos opcionais. Atalho `/` no composer filtra pelo shortcut.

### 5.5 Fluxos (tab)

Construtor visual simples (lista de passos, não DAG):
- **Gatilho**: primeira resposta · palavra-chave · entrada em estágio · sem resposta há X horas.
- **Passos**: enviar mensagem · enviar mídia · enviar botões · aguardar (h/d) · mover para estágio · adicionar tag · ramificar se cliente responder X · encerrar.
- Toggle ativo/inativo. Histórico de execuções por conversa.

### 5.6 Configurações do CRM

- Pipelines: criar/renomear, definir padrão.
- Estágios: cores e ordem.
- Webhook: status (verde se Evolution está enviando eventos).
- Horário comercial: pausa fluxos fora do horário.
- Opt-out: palavra-chave (ex: "PARAR") encerra conversa e bloqueia disparos.

## 6. Melhorias incluídas além do pedido

1. **Atalho `/`** para respostas rápidas no composer.
2. **Tags de personalização** funcionam em respostas rápidas e fluxos (reuso de `templateTags.ts`).
3. **Notas internas** para coordenar com a equipe sem o lead ver.
4. **Atribuição** de conversa a um membro (`assigned_to`).
5. **SLA visual**: badge vermelho se a conversa está parada há > X horas.
6. **Snooze** ("voltar amanhã às 9h").
7. **Sinal de digitando + lido** quando a Evolution reporta `presence`/`read`.
8. **Detecção de áudio recebido** com player no histórico (download + reproduzir).
9. **Preview de PDF/imagem** inline.
10. **Opt-out automático** ao receber "PARAR" / "SAIR".
11. **Métricas**: conversas por estágio, tempo médio de resposta, taxa de fechamento, top respostas rápidas usadas — em um mini dashboard no topo da tela.
12. **IA — Sugerir resposta** (botão no composer): usa Lovable AI para sugerir uma resposta com base no histórico da conversa e dados do lead. Toggle pode ser desligado.
13. **IA — Resumo da conversa**: gera bullet points do que foi conversado para handoff entre membros.
14. **Cota separada** do add-on CRM (ex: 5000 mensagens/mês) somada à do WhatsApp.

## 7. Catálogo / preço

Novo `addon`:
- slug: `whatsapp_crm`
- nome: **WhatsApp CRM Pro**
- preço: **R$ 99/mês**
- cota: 5.000 mensagens/mês
- depende do add-on `whatsapp` ativo (validação no `addon-purchase` e na UI).

## 8. Ordem de implementação

1. Migration (tabelas + RLS + GRANT + realtime + bucket `crm-media` + seed do add-on + estágios padrão criados via trigger na primeira ativação).
2. Edge function `evolution-webhook` + estender `whatsapp-user create` para registrar o webhook na instância.
3. Edge function `crm-send` (text + mídia + áudio + botões).
4. UI: rota `addon-crm`, layout 3 colunas, lista de conversas + timeline + composer básico (texto). Realtime nas conversas.
5. Respostas rápidas (CRUD + atalho `/`).
6. Mídias no composer (upload, gravação áudio, botões).
7. Kanban (toggle) com `@dnd-kit`.
8. Fluxos (CRUD + executor + cron).
9. IA — sugerir resposta + resumo.
10. Métricas no topo.

## 9. Pontos a confirmar antes de iniciar

- Preço sugerido **R$ 99/mês** e cota **5.000 msg/mês** OK?
- Quer que o CRM **dependa** do add-on WhatsApp (mais barato + complementar) ou **inclua** o WhatsApp no preço (substitui o anterior)?
- Os fluxos no MVP podem ser **lista de passos** (sequência) — construtor visual estilo grafo (DAG) fica como evolução. OK?
- Sugerir resposta com IA: deixar **opt-in por usuário** ou ligado por padrão? (Consome créditos de IA.)

Confirme essas 4 perguntas e implemento na ordem do §8.
