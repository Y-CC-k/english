/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 專案網址，例如 https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon public key */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
