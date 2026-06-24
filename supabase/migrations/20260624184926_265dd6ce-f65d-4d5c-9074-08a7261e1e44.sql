
-- ============ ADDONS CATALOG ============
CREATE TABLE public.addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  price_cents integer NOT NULL DEFAULT 0,
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly','one_time')),
  monthly_quota integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.addons TO authenticated;
GRANT ALL ON public.addons TO service_role;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons readable by authenticated" ON public.addons
  FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "addons admin write" ON public.addons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_addons_updated BEFORE UPDATE ON public.addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ADDONS ============
CREATE TABLE public.user_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_slug text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','canceled','pending')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  monthly_quota integer,
  monthly_used integer NOT NULL DEFAULT 0,
  quota_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  payment_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, addon_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addons TO authenticated;
GRANT ALL ON public.user_addons TO service_role;
ALTER TABLE public.user_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_addons owner read" ON public.user_addons
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_addons admin all" ON public.user_addons
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_user_addons_updated BEFORE UPDATE ON public.user_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER WHATSAPP INSTANCES ============
CREATE TABLE public.user_whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name text NOT NULL UNIQUE,
  connection_state text NOT NULL DEFAULT 'disconnected',
  last_qr_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_whatsapp_instances TO authenticated;
GRANT ALL ON public.user_whatsapp_instances TO service_role;
ALTER TABLE public.user_whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uwi owner" ON public.user_whatsapp_instances
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_uwi_updated BEFORE UPDATE ON public.user_whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MESSAGE TEMPLATES ============
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL,
  tags_used text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt owner" ON public.message_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_mt_updated BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MESSAGE HISTORY ============
CREATE TABLE public.message_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name text,
  phone text NOT NULL,
  lead_id uuid,
  template_id uuid,
  rendered_message text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending','received')),
  error text,
  evolution_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_history TO authenticated;
GRANT ALL ON public.message_history TO service_role;
ALTER TABLE public.message_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mh owner" ON public.message_history
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_mh_user_created ON public.message_history(user_id, created_at DESC);
CREATE INDEX idx_mh_lead ON public.message_history(lead_id);

-- ============ PAYMENT ORDERS — add addon_slug ============
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS addon_slug text,
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'package' CHECK (order_kind IN ('package','addon'));

-- ============ SEED — WhatsApp add-on ============
INSERT INTO public.addons (slug, name, description, icon, price_cents, billing_period, monthly_quota, sort_order)
VALUES (
  'whatsapp',
  'WhatsApp Prospect',
  'Conecte seu WhatsApp via QR Code, crie templates personalizados e dispare mensagens em massa para os leads capturados — com tags como {{nome}}, {{nome_socio}}, {{cidade}}, controle de cota e histórico por lead.',
  'message-circle',
  4900,
  'monthly',
  1000,
  1
)
ON CONFLICT (slug) DO NOTHING;
