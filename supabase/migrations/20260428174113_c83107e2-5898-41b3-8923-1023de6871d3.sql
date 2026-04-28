-- Adicionar provider e priority em api_configs
ALTER TABLE public.api_configs
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

-- Marcar a chave do Google Maps existente como provider google_places
UPDATE public.api_configs
SET provider = 'google_places'
WHERE key_name = 'GOOGLE_MAPS_API_KEY' AND provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_configs_provider_priority
  ON public.api_configs (provider, priority)
  WHERE is_active = true;

-- Tabela de configurações globais do sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role pode ler (edge functions)
CREATE POLICY "Service role can read system settings"
ON public.system_settings
FOR SELECT
USING ((SELECT ((current_setting('request.jwt.claims', true))::json ->> 'role')) = 'service_role');

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('allow_simulated_fallback', 'true'::jsonb, 'Quando todas as chaves de API falharem, retornar dados simulados com aviso ao usuário')
ON CONFLICT (setting_key) DO NOTHING;