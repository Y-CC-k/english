// 一次性小腳本：檢查 Supabase URL 與 publishable key
// 用法：node scripts/check-url.mjs <url> <apikey?> [table]
const url = (process.argv[2] ?? "").trim().replace(/\/+$/, "");
const key = (process.argv[3] ?? "").trim();
const table = (process.argv[4] ?? "notes").trim();

if (!url) {
  console.error("用法：node scripts/check-url.mjs <Supabase URL> <apikey> [table]");
  process.exit(1);
}

// 檢查 1：Auth 服務健康（新版專案連這裡都要帶 apikey）
console.log(`[1] GET ${url}/auth/v1/health ${key ? "（帶 apikey）" : ""} …`);
fetch(`${url}/auth/v1/health`, key ? { headers: { apikey: key } } : {})
  .then(async (r) => {
    const body = await r.text();
    console.log(`    HTTP ${r.status} → ${body.slice(0, 200).replace(/\s+/g, " ")}`);
    return r.ok;
  })
  .then((ok) => {
    if (!ok) {
      console.log("    ⇒ 專案可能被暫停或 URL 錯誤；不再往下測");
      return;
    }
    if (!key) return;
    // 檢查 2：用 publishable key 實際查一張表（GET /rest/v1/<table>）
    console.log(`[2] GET ${url}/rest/v1/${table}（帶 apikey）…`);
    return fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: key } })
      .then(async (r) => {
        const body = await r.text();
        console.log(`    HTTP ${r.status} ${r.statusText}`);
        console.log(`    內容：${body.slice(0, 300).replace(/\s+/g, " ")}`);
        if (r.ok) console.log("    ✔ key 有效、資料表存在");
        else if (body.includes("PGRST205") || body.includes("Could not find"))
          console.log("    ✔ key 有效（只是這張表還沒建立）");
        else if (r.status === 401 && body.includes("Invalid API key"))
          console.log("    ✖ 金鑰無效：請重新複製 publishable key");
        else if (body.includes("Secret API key required"))
          console.log("    ⇒ 此端點要求 secret key（僅限伺服器端用途；publishable key 不能用）");
      })
      .catch((e) => {
        console.error(`    ERR ${e.message}`);
        if (e.cause) console.error(`    cause：${e.cause}`);
      });
  })
  .catch((e) => {
    console.error(`[1] ERR ${e.message}`);
    if (e.cause) console.error(`    cause：${e.cause}`);
    console.log("    ⇒ 網路層連不上（URL 打錯／防火牆／專案被暫停）");
  });
