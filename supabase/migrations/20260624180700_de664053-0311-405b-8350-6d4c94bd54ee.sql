
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_qr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_wa_instance" ON public.whatsapp_instances FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_wa_instances_updated BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  result_id UUID REFERENCES public.search_results(id) ON DELETE SET NULL,
  to_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  evolution_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_wa_messages" ON public.whatsapp_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_wa_messages_user_created ON public.whatsapp_messages(user_id, created_at DESC);
