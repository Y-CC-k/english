// 一次性小腳本：從「前端視角」驗證 words / scores 的 RLS 行為
const url = "https://uhunwwvjzuaauklzzuwk.supabase.co";
const key = "sb_publishable_hxvVG4tC6-r-ZMge_5lLpQ_eiHArMyh";
const H = { apikey: key };

async function main() {
  // 匿名讀 words → 200（公開參考內容）
  let r = await fetch(`${url}/rest/v1/words?select=*&limit=1`, { headers: H });
  console.log(`[讀] words       → HTTP ${r.status}  ${r.ok ? "✔ 匿名可讀（預期）" : "✖"}`);

  // 匿名讀 scores → 200 但空（個資：策略只給 authenticated）
  r = await fetch(`${url}/rest/v1/scores?select=*&limit=1`, { headers: H });
  const sBody = await r.text();
  console.log(`[讀] scores      → HTTP ${r.status}  ${r.ok ? "✔ 匿名可查但只會拿到空列表（預期）" : "✖ " + sBody.slice(0, 120)}`);

  // 匿名寫 words → 42501（words 沒有寫入策略）
  r = await fetch(`${url}/rest/v1/words`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ grade: 3, week: 1, word: "probe", chinese: "探測" }),
  });
  let body = await r.text();
  console.log(`[寫] words       → HTTP ${r.status}  ${body.includes("42501") ? "✔ 正確被 RLS 擋（預期）" : "⚠ " + body.slice(0, 120)}`);

  // 匿名寫 scores → 42501（個人成績：必須登入）
  r = await fetch(`${url}/rest/v1/scores`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "probe", grade: 3, score: 1 }),
  });
  body = await r.text();
  console.log(`[寫] scores      → HTTP ${r.status}  ${body.includes("42501") ? "✔ 正確被 RLS 擋（預期）" : "✖ " + body.slice(0, 120)}`);

  // 匿名讀統計 view → 200 空（security_invoker 套用 scores 的策略）
  r = await fetch(`${url}/rest/v1/score_summary?select=*&limit=1`, { headers: H });
  body = await r.text();
  console.log(`[讀] 統計 view    → HTTP ${r.status}  ${r.ok ? "✔ 匿名可查但空（預期）" : "✖ " + body.slice(0, 120)}`);
}

main().catch((e) => { console.error("ERR", e.message); if (e.cause) console.error("cause", e.cause); });
