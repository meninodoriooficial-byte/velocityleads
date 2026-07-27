import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Tables to export (in dependency-friendly order). Sensitive/binary columns are stripped below.
const TABLES = [
  'profiles',
  'user_roles',
  'search_packages',
  'addons',
  'user_addons',
  'api_configs',
  'system_settings',
  'payment_orders',
  'whatsapp_instances',
  'user_whatsapp_instances',
  'email_accounts',
  'email_templates',
  'email_marketing_settings',
  'email_history',
  'message_templates',
  'message_history',
  'whatsapp_messages',
  'searches',
  'search_results',
  'api_error_logs',
  'crm_pipelines',
  'crm_stages',
  'crm_contacts',
  'crm_conversations',
  'crm_messages',
  'crm_flows',
  'crm_flow_runs',
  'crm_quick_replies',
];

// Columns removed from export (secrets / binary / oauth tokens).
const REDACT: Record<string, string[]> = {
  api_configs: ['api_key_encrypted', 'api_key_nonce'],
  email_accounts: ['smtp_pass', 'oauth_access_token', 'oauth_refresh_token'],
};

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v) || typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lines: string[] = [];
    lines.push(`-- Dump gerado em ${new Date().toISOString()}`);
    lines.push(`-- Sistema: VelocityLeads (dados de aplicação, schema public)`);
    lines.push(`-- Observação: colunas sensíveis (chaves criptografadas, tokens OAuth, senhas SMTP) foram removidas.`);
    lines.push(`SET session_replication_role = replica;`);
    lines.push('');

    for (const table of TABLES) {
      const { data, error } = await admin.from(table).select('*');
      if (error) {
        lines.push(`-- ERRO ao ler ${table}: ${error.message}`);
        lines.push('');
        continue;
      }
      lines.push(`-- =========================================`);
      lines.push(`-- Tabela: public.${table} (${data?.length ?? 0} linhas)`);
      lines.push(`-- =========================================`);
      if (!data || data.length === 0) {
        lines.push('');
        continue;
      }
      const redact = REDACT[table] || [];
      const cols = Object.keys(data[0]).filter((c) => !redact.includes(c));
      for (const row of data) {
        const values = cols.map((c) => sqlLiteral((row as any)[c])).join(', ');
        lines.push(`INSERT INTO public.${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${values});`);
      }
      lines.push('');
    }

    lines.push(`SET session_replication_role = DEFAULT;`);
    const sql = lines.join('\n');

    return new Response(sql, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="velocityleads-export-${new Date().toISOString().slice(0, 10)}.sql"`,
      },
    });
  } catch (e) {
    console.error('admin-export-sql error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});