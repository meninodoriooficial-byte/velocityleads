-- Evitar duplicar mensagens já capturadas pelo webhook/polling
CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_evo_unique
  ON public.crm_messages (user_id, evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

-- Marcação do último polling por instância
ALTER TABLE public.user_whatsapp_instances
  ADD COLUMN IF NOT EXISTS last_poll_at timestamptz;

-- Garantir extensões para o cron job
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;