-- 1. Habilitar extensão pgsodium para criptografia
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- 2. Adicionar novas colunas (mantém api_key temporariamente para migrar dados)
ALTER TABLE public.api_configs
  ADD COLUMN IF NOT EXISTS api_key_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS api_key_nonce BYTEA,
  ADD COLUMN IF NOT EXISTS api_key_last4 TEXT;

-- 3. Criar/garantir a chave-mestra no Vault do pgsodium
DO $$
DECLARE
  v_key_id uuid;
BEGIN
  SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'api_configs_master_key' LIMIT 1;
  IF v_key_id IS NULL THEN
    PERFORM pgsodium.create_key(name => 'api_configs_master_key');
  END IF;
END $$;

-- 4. Função interna (não exposta) para obter o id da chave-mestra
CREATE OR REPLACE FUNCTION private_get_master_key_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pgsodium, public
AS $$
  SELECT id FROM pgsodium.valid_key WHERE name = 'api_configs_master_key' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private_get_master_key_id() FROM PUBLIC, anon, authenticated;

-- 5. Função para definir/atualizar chave (apenas admins)
CREATE OR REPLACE FUNCTION public.set_api_key(_config_id uuid, _plain_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_nonce bytea;
  v_encrypted bytea;
  v_key_id uuid;
  v_last4 text;
BEGIN
  -- Verificar permissão
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem definir chaves de API';
  END IF;

  IF _plain_key IS NULL OR length(trim(_plain_key)) = 0 THEN
    -- Limpar chave
    UPDATE public.api_configs
    SET api_key_encrypted = NULL,
        api_key_nonce = NULL,
        api_key_last4 = NULL,
        updated_at = now()
    WHERE id = _config_id;
    RETURN;
  END IF;

  IF length(_plain_key) > 1000 THEN
    RAISE EXCEPTION 'Chave excede tamanho máximo permitido';
  END IF;

  v_key_id := private_get_master_key_id();
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Chave-mestra de criptografia não encontrada';
  END IF;

  v_nonce := pgsodium.crypto_aead_det_noncegen();
  v_encrypted := pgsodium.crypto_aead_det_encrypt(
    convert_to(_plain_key, 'utf8'),
    convert_to(_config_id::text, 'utf8'),
    v_key_id,
    v_nonce
  );
  v_last4 := right(_plain_key, 4);

  UPDATE public.api_configs
  SET api_key_encrypted = v_encrypted,
      api_key_nonce = v_nonce,
      api_key_last4 = v_last4,
      updated_at = now()
  WHERE id = _config_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_api_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_api_key(uuid, text) TO authenticated;

-- 6. Função para descriptografar (apenas service_role / edge functions)
CREATE OR REPLACE FUNCTION public.get_api_key_decrypted(_key_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_role text;
  v_row record;
  v_key_id uuid;
  v_decrypted bytea;
BEGIN
  v_role := (current_setting('request.jwt.claims', true)::json->>'role');
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: somente o backend pode descriptografar chaves';
  END IF;

  SELECT id, api_key_encrypted, api_key_nonce, is_active
  INTO v_row
  FROM public.api_configs
  WHERE key_name = _key_name AND is_active = true
  ORDER BY priority ASC
  LIMIT 1;

  IF v_row.id IS NULL OR v_row.api_key_encrypted IS NULL OR v_row.api_key_nonce IS NULL THEN
    RETURN NULL;
  END IF;

  v_key_id := private_get_master_key_id();
  v_decrypted := pgsodium.crypto_aead_det_decrypt(
    v_row.api_key_encrypted,
    convert_to(v_row.id::text, 'utf8'),
    v_key_id,
    v_row.api_key_nonce
  );
  RETURN convert_from(v_decrypted, 'utf8');
END;
$$;

REVOKE ALL ON FUNCTION public.get_api_key_decrypted(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_key_decrypted(text) TO service_role;

-- 7. Função que retorna TODAS as chaves ativas de um provider em ordem de prioridade (para fallback)
CREATE OR REPLACE FUNCTION public.get_provider_keys_decrypted(_provider text)
RETURNS TABLE(id uuid, key_name text, api_key text, priority integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_role text;
  v_master_id uuid;
  rec record;
BEGIN
  v_role := (current_setting('request.jwt.claims', true)::json->>'role');
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: somente o backend pode descriptografar chaves';
  END IF;

  v_master_id := private_get_master_key_id();

  FOR rec IN
    SELECT c.id, c.key_name, c.api_key_encrypted, c.api_key_nonce, c.priority
    FROM public.api_configs c
    WHERE c.provider = _provider
      AND c.is_active = true
      AND c.api_key_encrypted IS NOT NULL
      AND c.api_key_nonce IS NOT NULL
    ORDER BY c.priority ASC
  LOOP
    id := rec.id;
    key_name := rec.key_name;
    priority := rec.priority;
    api_key := convert_from(
      pgsodium.crypto_aead_det_decrypt(
        rec.api_key_encrypted,
        convert_to(rec.id::text, 'utf8'),
        v_master_id,
        rec.api_key_nonce
      ),
      'utf8'
    );
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_keys_decrypted(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_keys_decrypted(text) TO service_role;

-- 8. Migrar chaves existentes em texto puro
DO $$
DECLARE
  rec record;
  v_master_id uuid;
  v_nonce bytea;
  v_encrypted bytea;
BEGIN
  v_master_id := private_get_master_key_id();
  FOR rec IN SELECT id, api_key FROM public.api_configs WHERE api_key IS NOT NULL AND length(api_key) > 0 AND api_key_encrypted IS NULL
  LOOP
    v_nonce := pgsodium.crypto_aead_det_noncegen();
    v_encrypted := pgsodium.crypto_aead_det_encrypt(
      convert_to(rec.api_key, 'utf8'),
      convert_to(rec.id::text, 'utf8'),
      v_master_id,
      v_nonce
    );
    UPDATE public.api_configs
    SET api_key_encrypted = v_encrypted,
        api_key_nonce = v_nonce,
        api_key_last4 = right(rec.api_key, 4)
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 9. Remover coluna api_key em texto puro
ALTER TABLE public.api_configs DROP COLUMN IF EXISTS api_key;

-- 10. Atualizar política RLS de admin: admins ainda podem fazer SELECT/UPDATE/DELETE/INSERT em api_configs,
-- mas NÃO veem mais a chave em texto puro (já não existe coluna). Para definir/atualizar a chave,
-- DEVEM usar a função set_api_key.
-- A policy "Admins can manage api configs" já existe e cobre tudo via has_role.