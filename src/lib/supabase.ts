import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 從 .env 讀取設定（Vite 規定前端可用的變數 VITE_ 開頭）。
 * 改了 .env 之後要重啟 dev server 才會生效。
 */
export function loadConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return { url, key, configured: Boolean(url && key) };
}

/**
 * Supabase client（單例）。
 * 尚未填 .env 時回傳 null，頁面會顯示設定提示而不是直接壞掉。
 *
 * 安全提醒：anon key 本來就是「公開金鑰」，會打包進前端，這是正常做法；
 * 資料的保護靠資料庫的 RLS（Row Level Security），service_role key 絕不可放前端。
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const { url, key, configured } = loadConfig();
  if (!configured) return null;
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
