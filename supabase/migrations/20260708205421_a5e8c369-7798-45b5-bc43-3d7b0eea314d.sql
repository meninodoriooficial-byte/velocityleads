
-- 1) Política INSERT explícita: apenas admins podem inserir em user_roles
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Revogar EXECUTE em funções SECURITY DEFINER sensíveis (uso somente pelo backend/service_role)
REVOKE ALL ON FUNCTION public.private_get_master_key_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_provider_keys_decrypted(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_api_key_decrypted(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_api_key(uuid, text) FROM PUBLIC, anon;
-- set_api_key precisa ser chamável por admins autenticados
GRANT EXECUTE ON FUNCTION public.set_api_key(uuid, text) TO authenticated;

-- crm_seed_default_pipeline pode ser disparada por usuário autenticado durante onboarding
REVOKE ALL ON FUNCTION public.crm_seed_default_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_seed_default_pipeline(uuid) TO authenticated;

-- has_role é usado dentro de policies RLS; precisa continuar executável por authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- handle_new_user e update_updated_at_column são triggers; nada expõe ao PostgREST, mas por precaução:
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
