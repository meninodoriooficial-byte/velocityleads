-- Tabela para registrar erros de APIs externas
CREATE TABLE public.api_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web-search',
  error_status TEXT,
  error_message TEXT,
  http_status INTEGER,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_error_logs_key_created ON public.api_error_logs (key_name, created_at DESC);

ALTER TABLE public.api_error_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem visualizar
CREATE POLICY "Admins can view error logs"
ON public.api_error_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Apenas admins podem limpar manualmente
CREATE POLICY "Admins can delete error logs"
ON public.api_error_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Inserts vêm das edge functions com service_role, RLS ignorado para esse role
CREATE POLICY "Service role can insert error logs"
ON public.api_error_logs
FOR INSERT
WITH CHECK ((SELECT ((current_setting('request.jwt.claims', true))::json ->> 'role')) = 'service_role');