
CREATE TABLE public.payment_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  package_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'mercado_pago',
  environment text NOT NULL DEFAULT 'test',
  preference_id text,
  payment_id text,
  amount numeric NOT NULL DEFAULT 0,
  searches_credited integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  raw_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_orders_user ON public.payment_orders(user_id);
CREATE INDEX idx_payment_orders_preference ON public.payment_orders(preference_id);
CREATE INDEX idx_payment_orders_payment ON public.payment_orders(payment_id);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own orders"
  ON public.payment_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all orders"
  ON public.payment_orders FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages orders"
  ON public.payment_orders FOR ALL
  USING (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role')
  WITH CHECK (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role');

CREATE TRIGGER update_payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
