import { supabase } from "./supabase";

/** klnes 資料列（對應示範表 schema）。 */
export type KlnesRow = {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  created_at: string;
};

/** 資料庫錯誤的中文化。 */
export function friendlyDbError(message: string): string {
  if (message.includes("row-level security")) {
    return "被資料表的安全策略（RLS）擋下：請先登入 —— 每個登入者只能存取自己新增的資料。";
  }
  if (message.toLowerCase().includes("null value")) {
    return "必填欄位沒填到（title）。";
  }
  return message;
}

/** 列出自己的資料（RLS 會自動只回 auth.uid() 是自己的那部分）。 */
export async function listKlnes(): Promise<KlnesRow[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("klnes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyDbError(error.message));
  return (data as KlnesRow[]) ?? [];
}

/**
 * 新增一筆。
 * user_id 不用送 —— 資料表的 default auth.uid() 會用登入者的 ID 填入。
 */
export async function addKlnes(title: string, note: string | null): Promise<KlnesRow> {
  const sb = supabase()!;
  const { data, error } = await sb.from("klnes").insert({ title, note }).select().single();
  if (error) throw new Error(friendlyDbError(error.message));
  return data as KlnesRow;
}

/** 刪除（RLS 保證只能刪自己的那筆）。 */
export async function deleteKlnes(id: string): Promise<void> {
  const sb = supabase()!;
  const { error } = await sb.from("klnes").delete().eq("id", id);
  if (error) throw new Error(friendlyDbError(error.message));
}
