// Dados do seu projeto Supabase.
// Onde achar: Supabase > Project Settings > API (ou "Data API" / "API Keys").
//
// A chave "anon" (ou "publishable") PODE ficar no site: quem protege os dados
// são as regras de segurança (RLS) criadas no supabase/schema.sql.
// NUNCA coloque aqui a chave "service_role" (ou "secret") - ela só vai no arquivo .env do script.
const SUPABASE_URL = "https://bwthjqlqihncngikojmu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__KxwywBPJkgQXKR6oF-KDg_WRAB4N76";

const SUPABASE_CONFIGURADO = !SUPABASE_URL.startsWith("COLE_AQUI") && !SUPABASE_ANON_KEY.startsWith("COLE_AQUI");

const supabaseClient = SUPABASE_CONFIGURADO
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
