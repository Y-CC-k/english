import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** 常見 Auth 錯誤的中文化轉換。 */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email 或密碼不正確。";
  if (m.includes("email not confirmed")) return "此 Email 尚未完成驗證，請先到信箱收確認信。";
  if (m.includes("user already registered")) return "此 Email 已註冊，請改用登入。";
  if (m.includes("at least 6 characters") || m.includes("too weak")) return "密碼至少要 6 個字元。";
  if (m.includes("rate limit")) return "嘗試太多次了，請稍後再試（Supabase 有寄信／嘗試次數上限）。";
  if (m.includes("invalid email")) return "Email 格式看起來不正確。";
  if (m.includes("signups not allowed")) return "此專案目前不開放註冊。（Dashboard → Authentication → Providers → Email）";
  if (m.includes("invalid api key") || m.includes("jwt")) return "金鑰或設定有問題，請先跑一次「連線測試」。";
  return message;
}

/** 取得目前的 session；沒填 .env 或錯誤時回傳 null。 */
export async function getSession(): Promise<Session | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession：" + error.message);
    return null;
  }
  return data.session;
}

/** 訂閱登入／登出狀態變化；回傳解除訂閱的函式。 */
export function onAuthChange(cb: (session: Session | null) => void) {
  const sb = supabase();
  if (!sb) return () => {};
  const sub = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => sub.data.subscription.unsubscribe();
}

/**
 * 註冊。
 * 新專案預設開啟「Confirm email」→ 回傳 needConfirm = true，
 * 代表 Supabase 已寄出驗證信，使用者收完信才能登入。
 */
export async function signUp(email: string, password: string) {
  const sb = supabase()!;
  const { data, error } = await sb.auth.signUp({ email, password });
  return { needConfirm: Boolean(data.user && !data.session), error };
}

/** 登入（Email + 密碼）。 */
export async function signIn(email: string, password: string) {
  const sb = supabase()!;
  return sb.auth.signInWithPassword({ email, password });
}

/** 登出。 */
export async function signOut() {
  const sb = supabase()!;
  return sb.auth.signOut();
}

/** 寄出重設密碼的信（點信中的連結到 Supabase 設定好的 Site URL 設定新密碼）。 */
export async function sendResetMail(email: string) {
  const sb = supabase()!;
  return sb.auth.resetPasswordForEmail(email);
}
