
-- 1) Catálogo: insere addon Email Marketing
INSERT INTO public.addons (slug, name, description, icon, price_cents, billing_period, monthly_quota, sort_order, is_active)
VALUES (
  'email_marketing',
  'Email Marketing',
  'Conecte até 5 contas (Gmail, Outlook ou SMTP), defina limites diários, ordem de envio e modo rotacional. Ideal para contatar leads quando o telefone não é WhatsApp.',
  'Mail',
  4990,
  'monthly',
  5,
  20,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  monthly_quota = EXCLUDED.monthly_quota,
  is_active = true;

-- 2) Tabela email_accounts
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail','outlook','smtp')),
  email text NOT NULL,
  display_name text,
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_pass text,
  smtp_secure boolean NOT NULL DEFAULT true,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_expires_at timestamptz,
  daily_limit int NOT NULL DEFAULT 50,
  sent_today int NOT NULL DEFAULT 0,
  last_reset date NOT NULL DEFAULT CURRENT_DATE,
  send_order int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO authenticated;
GRANT ALL ON public.email_accounts TO service_role;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own email accounts" ON public.email_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Configurações de Email Marketing (rotacional etc)
CREATE TABLE IF NOT EXISTS public.email_marketing_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rotational boolean NOT NULL DEFAULT true,
  last_used_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_marketing_settings TO authenticated;
GRANT ALL ON public.email_marketing_settings TO service_role;
ALTER TABLE public.email_marketing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own em settings" ON public.email_marketing_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_em_settings_updated_at
  BEFORE UPDATE ON public.email_marketing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Trigger para limitar a 5 contas por usuário
CREATE OR REPLACE FUNCTION public.enforce_email_accounts_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.email_accounts WHERE user_id = NEW.user_id;
  IF c >= 5 THEN
    RAISE EXCEPTION 'Limite de 5 contas de e-mail por usuário atingido';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_accounts_limit ON public.email_accounts;
CREATE TRIGGER trg_email_accounts_limit
  BEFORE INSERT ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_accounts_limit();
