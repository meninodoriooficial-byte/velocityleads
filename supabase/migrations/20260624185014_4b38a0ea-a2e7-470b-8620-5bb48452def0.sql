ALTER TABLE public.payment_orders ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE public.payment_orders ALTER COLUMN searches_credited DROP NOT NULL;
ALTER TABLE public.payment_orders ALTER COLUMN searches_credited SET DEFAULT 0;