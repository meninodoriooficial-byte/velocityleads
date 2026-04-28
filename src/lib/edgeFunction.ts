import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EdgeFunctionError {
  status: number;
  title: string;
  description: string;
  raw?: any;
}

/**
 * Converte qualquer erro de edge function em uma mensagem amigável,
 * indicando provável causa e ação sugerida.
 */
export function explainEdgeError(error: any, data?: any): EdgeFunctionError {
  // Tenta extrair status do erro do supabase-js (FunctionsHttpError)
  const status: number =
    error?.context?.status ??
    error?.status ??
    (data?.error ? 400 : 0);

  const serverMsg: string | undefined =
    data?.error || error?.context?.body?.error || error?.message;

  // CORS / network: fetch lança TypeError "Failed to fetch"
  if (
    error?.name === "TypeError" ||
    /failed to fetch|network|cors/i.test(error?.message || "")
  ) {
    return {
      status: 0,
      title: "Falha de conexão",
      description:
        "Não foi possível alcançar o servidor. Verifique sua internet e tente novamente. Se persistir, pode ser um bloqueio de CORS ou o servidor está temporariamente indisponível.",
      raw: error,
    };
  }

  switch (status) {
    case 401:
      return {
        status,
        title: "Sessão inválida",
        description:
          serverMsg ||
          "Sua sessão expirou ou o token está ausente. Faça login novamente para continuar.",
        raw: error,
      };
    case 403:
      return {
        status,
        title: "Acesso negado",
        description:
          serverMsg ||
          "Você não tem permissão para esta ação. Verifique se sua conta possui o papel necessário (ex.: administrador).",
        raw: error,
      };
    case 404:
      return {
        status,
        title: "Recurso não encontrado",
        description:
          serverMsg || "A função ou recurso solicitado não foi encontrado.",
        raw: error,
      };
    case 408:
    case 504:
      return {
        status,
        title: "Tempo esgotado",
        description: "A operação demorou muito para responder. Tente novamente em instantes.",
        raw: error,
      };
    case 429:
      return {
        status,
        title: "Muitas requisições",
        description: "Você atingiu o limite de requisições. Aguarde alguns segundos antes de tentar de novo.",
        raw: error,
      };
    case 500:
    case 502:
    case 503:
      return {
        status,
        title: "Erro no servidor",
        description:
          serverMsg ||
          "Algo deu errado no nosso servidor. Tente novamente. Se persistir, contate o suporte.",
        raw: error,
      };
    default:
      if (status >= 400 && status < 500) {
        return {
          status,
          title: "Requisição inválida",
          description: serverMsg || `Erro ${status}. Verifique os dados enviados.`,
          raw: error,
        };
      }
      return {
        status: status || 0,
        title: "Erro inesperado",
        description: serverMsg || "Ocorreu um erro desconhecido. Tente novamente.",
        raw: error,
      };
  }
}

/**
 * Wrapper para supabase.functions.invoke que trata erros de forma padronizada.
 * Retorna data se sucesso, ou lança EdgeFunctionError tratado.
 */
export async function invokeEdgeFunction<T = any>(
  name: string,
  options?: { body?: any; showToast?: boolean }
): Promise<T> {
  const { body, showToast = true } = options || {};
  const { data, error } = await supabase.functions.invoke(name, { body });

  // Caso 1: erro de transporte / não-2xx
  if (error) {
    const explained = explainEdgeError(error, data);
    if (showToast) {
      toast.error(explained.title, { description: explained.description });
    }
    throw explained;
  }

  // Caso 2: 2xx mas com payload de erro de aplicação
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    const explained = explainEdgeError(null, data);
    if (showToast) {
      toast.error(explained.title, { description: explained.description });
    }
    throw explained;
  }

  return data as T;
}