
-- =============== PIPELINES ===============
CREATE TABLE public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines owner" ON public.crm_pipelines
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_crm_pipelines_upd BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== STAGES ===============
CREATE TABLE public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  sort_order integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stages owner" ON public.crm_stages
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crm_stages_pipeline ON public.crm_stages(pipeline_id, sort_order);

-- =============== CONVERSATIONS ===============
CREATE TABLE public.crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text,
  lead_id uuid,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','snoozed','blocked')),
  snoozed_until timestamptz,
  opted_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_conversations TO authenticated;
GRANT ALL ON public.crm_conversations TO service_role;
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_convs owner" ON public.crm_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crm_convs_user_last ON public.crm_conversations(user_id, last_message_at DESC);
CREATE INDEX idx_crm_convs_stage ON public.crm_conversations(stage_id);
CREATE TRIGGER trg_crm_convs_upd BEFORE UPDATE ON public.crm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== MESSAGES ===============
CREATE TABLE public.crm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out','note')),
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','audio','video','document','button','template','note','system')),
  body text,
  media_url text,
  media_mime text,
  media_filename text,
  duration_ms integer,
  buttons jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','read','failed')),
  error text,
  evolution_message_id text,
  replied_to_id uuid REFERENCES public.crm_messages(id) ON DELETE SET NULL,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_messages TO authenticated;
GRANT ALL ON public.crm_messages TO service_role;
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_msgs owner" ON public.crm_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crm_msgs_conv ON public.crm_messages(conversation_id, created_at);

-- =============== QUICK REPLIES ===============
CREATE TABLE public.crm_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  attachments jsonb,
  tags_used text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shortcut)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_quick_replies TO authenticated;
GRANT ALL ON public.crm_quick_replies TO service_role;
ALTER TABLE public.crm_quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_qr owner" ON public.crm_quick_replies
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_crm_qr_upd BEFORE UPDATE ON public.crm_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== FLOWS ===============
CREATE TABLE public.crm_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger jsonb NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_flows TO authenticated;
GRANT ALL ON public.crm_flows TO service_role;
ALTER TABLE public.crm_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_flows owner" ON public.crm_flows
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_crm_flows_upd BEFORE UPDATE ON public.crm_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.crm_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.crm_flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  current_step_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','paused','failed')),
  next_run_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_flow_runs TO authenticated;
GRANT ALL ON public.crm_flow_runs TO service_role;
ALTER TABLE public.crm_flow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_flow_runs owner" ON public.crm_flow_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_crm_flow_runs_due ON public.crm_flow_runs(next_run_at) WHERE status = 'running';
CREATE TRIGGER trg_crm_flow_runs_upd BEFORE UPDATE ON public.crm_flow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== CONTACTS ===============
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  email text,
  company text,
  notes text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_contacts owner" ON public.crm_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_crm_contacts_upd BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== Seed default pipeline function ===============
CREATE OR REPLACE FUNCTION public.crm_seed_default_pipeline(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
  v_exists uuid;
BEGIN
  SELECT id INTO v_exists FROM public.crm_pipelines WHERE user_id = _user_id AND is_default = true LIMIT 1;
  IF v_exists IS NOT NULL THEN RETURN v_exists; END IF;

  INSERT INTO public.crm_pipelines (user_id, name, is_default)
  VALUES (_user_id, 'Vendas', true) RETURNING id INTO v_pipeline_id;

  INSERT INTO public.crm_stages (pipeline_id, user_id, name, color, sort_order, is_won, is_lost) VALUES
    (v_pipeline_id, _user_id, 'Novo',            '#3b82f6', 1, false, false),
    (v_pipeline_id, _user_id, 'Em qualificação', '#8b5cf6', 2, false, false),
    (v_pipeline_id, _user_id, 'Proposta',        '#f59e0b', 3, false, false),
    (v_pipeline_id, _user_id, 'Negociação',      '#ec4899', 4, false, false),
    (v_pipeline_id, _user_id, 'Ganho',           '#10b981', 5, true,  false),
    (v_pipeline_id, _user_id, 'Perdido',         '#ef4444', 6, false, true);

  RETURN v_pipeline_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.crm_seed_default_pipeline(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_pipeline(uuid) TO service_role;

-- =============== Realtime ===============
ALTER TABLE public.crm_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.crm_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_messages;

-- =============== Seed catalog entry ===============
INSERT INTO public.addons (slug, name, description, icon, price_cents, billing_period, monthly_quota, sort_order)
VALUES (
  'whatsapp_crm',
  'WhatsApp CRM Pro',
  'CRM completo estilo Kanban para o WhatsApp: inbox em tempo real, respostas rápidas, envio de áudio/imagens/documentos/botões, fluxos automáticos e IA para sugerir respostas. Depende do add-on WhatsApp.',
  'kanban',
  9900,
  'monthly',
  5000,
  2
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  monthly_quota = EXCLUDED.monthly_quota,
  sort_order = EXCLUDED.sort_order;
