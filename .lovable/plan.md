# Add-on: Envio de WhatsApp via Evolution API

Módulo opcional que permite cada usuário conectar seu próprio número de WhatsApp (via QR Code da Evolution API) e disparar mensagens para os leads capturados.

## Pré-requisitos do usuário

Preciso que você forneça/confirme:
1. **URL base da Evolution API** (ex: `https://evolution.seudominio.com`) — servidor onde a Evolution está hospedada.
2. **API Key global** da Evolution API (chave de admin que cria instâncias).

Se ainda não tem uma Evolution API rodando, é necessário hospedar uma (Docker/VPS) — a Evolution não oferece SaaS oficial. Posso te orientar depois.

Esses dois valores vão como **secrets** (`EVOLUTION_API_URL` e `EVOLUTION_API_KEY`) — só backend acessa.

## Banco de dados (novas tabelas)

**`whatsapp_instances`** — uma instância Evolution por usuário
- `id`, `user_id` (FK auth.users), `instance_name` (único, ex: `user_<uuid>`)
- `phone_number` (preenchido após conexão), `status` (`disconnected` | `connecting` | `connected`)
- `last_qr` (texto base64, temporário), `created_at`, `updated_at`
- RLS: usuário vê/edita só a própria; service_role acesso total

**`whatsapp_messages`** — log de envios
- `id`, `user_id`, `instance_id` (FK), `result_id` (FK search_results, nullable)
- `to_number`, `message`, `status` (`pending`|`sent`|`failed`), `error`, `evolution_message_id`, `created_at`
- RLS: usuário vê só as próprias

## Edge Functions

Todas chamam a Evolution API server-side usando os secrets, autenticadas via JWT do usuário.

1. **`whatsapp-connect`** — cria instância na Evolution se não existir, chama `/instance/connect/<name>`, retorna QR code base64. Atualiza `status=connecting`.
2. **`whatsapp-status`** — polling: chama `/instance/connectionState/<name>`. Quando `open`, atualiza `status=connected` e busca número via `/instance/fetchInstances`.
3. **`whatsapp-disconnect`** — `/instance/logout/<name>`, opcionalmente `/instance/delete/<name>`.
4. **`whatsapp-send`** — recebe `{ result_ids[], message }`, valida tamanho/template, normaliza telefones BR (E.164: `55<DDD><num>`), itera chamando `/message/sendText/<name>` com pequeno delay anti-ban, grava cada envio em `whatsapp_messages`.

## Frontend

**Nova página `/whatsapp`** (rota protegida, item no `AppSidebar`):
- **Card "Conexão"**: status atual + botão "Conectar WhatsApp" → abre modal com QR code (poll a cada 3s até `connected`), botão "Desconectar".
- **Card "Modelo de mensagem"**: textarea com variáveis `{{nome}}`, `{{cidade}}`, preview.

**Integração em `ResultsList.tsx`**:
- Botão "WhatsApp" em cada card (habilita só se `whatsapp` do lead existir e instância conectada).
- Botão de seleção múltipla + ação "Enviar para selecionados" no topo da lista → modal com template, confirma e dispara via `whatsapp-send`.

**Histórico simples** na página `/whatsapp`: lista das últimas mensagens enviadas com status.

## Segurança / boas práticas

- Secrets `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` ficam só em edge functions.
- Validação Zod nos bodies das functions; limite de 50 destinatários por chamada.
- Delay aleatório 1–3s entre envios para reduzir risco de banimento.
- Telefones inválidos são marcados como `failed` sem abortar o lote.
- RLS estrita: usuário nunca acessa instância/mensagens de outro.

## O que NÃO está incluso (posso adicionar depois se quiser)

- Agendamento de envios, campanhas recorrentes, métricas avançadas.
- Envio de mídia (imagem/áudio/documento) — começamos só com texto.
- Webhook da Evolution para receber respostas (inbox bidirecional).

---

**Confirma:**
1. Você já tem uma Evolution API hospedada? (se sim, me passe URL + API key via secrets quando eu pedir)
2. Pode começar com envio só de **texto** (sem mídia) e **sem agendamento**?
