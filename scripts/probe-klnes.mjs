// 一次性小腳本：探測 public.klnes 的欄位結構與 RLS 權限
// 方法：POST {} 建一筆 → GET 讀回來（從欄位得知 schema）→ DELETE 清掉
const url = "https://uhunwwvjzuaauklzzuwk.supabase.co";
const key = "sb_publishable_hxvVG4tC6-r-ZMge_5lLpQ_eiHArMyh";
const H = { apikey: key, "Content-Type": "application/json" };

async function main() {
  // 1) 插一筆空資料
  console.log("[1] POST /rest/v1/klnes（body: {}）…");
  const post = await fetch(`${url}/rest/v1/klnes`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({}),
  });
  const postText = await post.text();
  console.log(`    HTTP ${post.status}`);
  console.log(`    內容：${postText.slice(0, 400)}`);
  if (!post.ok) return;

  // 2) 讀回來看欄位
  console.log("[2] GET /rest/v1/klnes …");
  const get = await fetch(`${url}/rest/v1/klnes?select=*&limit=3`, { headers: H });
  const rows = await get.json();
  console.log(`    HTTP ${get.status}，${Array.isArray(rows) ? rows.length : "?"} 筆`);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log("    欄位：", Object.keys(rows[0]).join(", "));
    console.log("    原始：", JSON.stringify(rows));
  }

  // 3) 清掉剛剛那筆（若沒有 id 欄位，就整表清空 — 測前已是 0 筆）
  console.log("[3] DELETE …");
  const rowId = Array.isArray(rows) && rows.length > 0 && "id" in rows[0] ? rows[0].id : null;
  const del = await fetch(`${url}/rest/v1/klnes${rowId != null ? `?id=eq.${rowId}` : ""}`, {
    method: "DELETE",
    headers: H,
  });
  console.log(`    HTTP ${del.status}`);
  if (del.ok) console.log("    ✔ 清理完成，資料表已還原為空");
}

main().catch((e) => {
  console.error("ERR", e.message);
  if (e.cause) console.error("cause", e.cause);
});
