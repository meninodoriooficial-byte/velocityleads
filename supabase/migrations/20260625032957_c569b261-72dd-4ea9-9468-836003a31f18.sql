
CREATE TABLE public.email_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid,
  account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text,
  body_text text,
  provider text,
  status text NOT NULL DEFAULT 'sent',
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_history_user_to_idx ON public.email_history(user_id, lower(to_email));
CREATE INDEX email_history_user_created_idx ON public.email_history(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_history TO authenticated;
GRANT ALL ON public.email_history TO service_role;

ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email history"
ON public.email_history FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
