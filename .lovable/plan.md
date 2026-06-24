# Add-ons / Marketplace de Recursos

Criar um sistema de **add-ons** que o usuário compra e ativa por conta. O primeiro add-on é o **WhatsApp (Evolution API)**, que reaproveita a infra de Evolution já configurada no superadmin. A arquitetura fica pronta para novos add-ons (Email, CRM, Disparos em massa, IA de copy, etc.).

## 1. Menu lateral

Adicionar item **"Add-ons"** no `AppSidebar`. Quando o usuário tem um add-on ativo, aparece um submenu por add-on (ex: "WhatsApp") com um **badge verde "Ativo"** (texto branco) ao lado. Clicar no submenu abre a tela de configuração daquele add-on.

```text
Add-ons
 ├─ WhatsApp   [Ativo]   ← badge verde
 └─ ...
```

## 2. Página "Marketplace de Add-ons"

Grid de cards:
- Ícone, nome, descrição curta, preço (mensal ou one-shot), botão **"Ativar"** ou **"Gerenciar"** se já ativo.
- Card do add-on ativo mostra o mesmo badge verde "Ativo".
- Clicar em "Ativar" cria um `payment_order` (reusando o fluxo Mercado Pago já existente). Quando o webhook confirma, marca o add-on como ativo para o usuário.

## 3. Página "Configurar Add-on: WhatsApp"

Três abas:

### Aba 1 — Conexão
- Campo "Nome da instância" (auto-gerado: `user_<id>` editável).
- Botão **Criar/Conectar** → mostra QR Code (reusa as actions `create`/`connect`/`state` da edge function `evolution-test`).
- Indicador de status (Desconectado / Conectando / **Conectado**) com polling.
- Botão "Desconectar" / "Gerar novo QR".

### Aba 2 — Templates de mensagem
- CRUD de templates com nome + corpo.
- Toolbar de **tags de personalização** que insere no cursor:
  - `{{nome}}` — nome do lead/empresa
  - `{{nome_socio}}` — sócio principal
  - `{{cidade}}` `{{estado}}` `{{bairro}}` `{{ramo}}`
  - `{{telefone}}` `{{email}}` `{{site}}`
  - `{{primeiro_nome_socio}}`
- Preview ao vivo com um lead de exemplo.
- Validação: avisa tags inexistentes.

### Aba 3 — Disparos (melhoria proposta — ver §6)

## 4. Backend — tabelas novas

```text
addons                  catálogo (admin gerencia preços/ativação)
  id, slug, name, description, price_cents, billing_period, icon, is_active

user_addons             qual user tem qual add-on ativo
  id, user_id, addon_slug, status (active|expired|canceled),
  activated_at, expires_at, payment_order_id

user_whatsapp_instances  config WhatsApp por usuário
  id, user_id, instance_name, connection_state, last_qr_at, connected_at

message_templates        templates do usuário
  id, user_id, name, body, tags_used[], created_at, updated_at
```

Todas com RLS por `auth.uid()` e GRANTs padrão.

## 5. Edge functions

- `addon-purchase` — cria `payment_order` para o add-on (reusa `mp-create-preference`).
- `mp-webhook` — ao confirmar pagamento de um add-on, insere/renova `user_addons`.
- `whatsapp-user` — versão por usuário das ações `create | connect | state | send` (substitui o uso direto de `evolution-test` que é admin-only).
- `render-template` — recebe `template_id` + `lead_id` e devolve mensagem com tags substituídas.

## 6. Melhorias para prospecção (proposto)

Recursos que tornam o add-on realmente útil para prospectar:

1. **Disparo a partir dos resultados de busca** — selecionar leads na lista e enviar template em fila (rate-limit configurável, ex: 1 msg / 8s) para evitar bloqueio do WhatsApp.
2. **Sequências (follow-up)** — se o lead não responder em N dias, enviar template 2, depois template 3.
3. **Detecção de resposta** — webhook da Evolution marca lead como "respondeu" e pausa a sequência.
4. **Variações A/B** — múltiplas versões do mesmo template, escolha aleatória para evitar padrão repetitivo (também reduz bloqueio).
5. **Spintax leve** — `{Olá|Oi|Bom dia}` para variar a saudação automaticamente.
6. **Agendamento** — escolher dia/hora do disparo, respeitar horário comercial por fuso do estado do lead.
7. **Blacklist / opt-out** — número que responder "PARAR" entra em lista que bloqueia futuros disparos.
8. **Histórico por lead** — timeline de mensagens enviadas/recebidas por lead.
9. **Limites de plano** — cada add-on tem cota mensal (ex: 1.000 disparos), exibida no header da aba.
10. **Score de qualidade** — alerta se a taxa de resposta cair muito (indica que o número pode estar sendo penalizado).

Implementar nesta primeira entrega: 1, 4, 8 e 9 (alto impacto, baixo custo). Os demais ficam como evolução.

## 7. Ordem de implementação

1. Migration (tabelas + RLS + GRANT) e seed do add-on "whatsapp".
2. Página Marketplace + item no sidebar (sem badge ainda).
3. Edge function `addon-purchase` + hook no `mp-webhook` para ativar.
4. Página de configuração WhatsApp, aba Conexão (refator de `evolution-test` para `whatsapp-user`).
5. Submenu dinâmico no sidebar com badge verde "Ativo".
6. CRUD de templates + preview com tags.
7. Disparo a partir da lista de resultados + histórico + cota.

## 8. Pontos a confirmar antes de iniciar

- Preço e periodicidade do add-on WhatsApp (ex: R$ 49/mês? R$ 199 vitalício?).
- Cota mensal de disparos por usuário.
- Quais tags adicionais você quer além das listadas em §3.
- Posso usar o Mercado Pago já configurado no projeto para cobrar os add-ons?
