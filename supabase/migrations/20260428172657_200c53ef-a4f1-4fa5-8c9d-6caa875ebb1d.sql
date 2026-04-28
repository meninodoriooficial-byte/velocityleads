
CREATE TABLE public.api_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  api_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api configs"
ON public.api_configs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_api_configs_updated_at
BEFORE UPDATE ON public.api_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.api_configs (key_name, display_name, description) VALUES
  ('GOOGLE_MAPS_API_KEY', 'Google Maps API Key', 'Chave da Google Places API para buscas reais de empresas'),
  ('CASADOSDADOS_API_KEY', 'Casa dos Dados API Key', 'Chave para integração com casadosdados.com.br'),
  ('OPENAI_API_KEY', 'OpenAI API Key', 'Chave para enriquecimento de dados via OpenAI');
