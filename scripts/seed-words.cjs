/**
 * words 單字 master 表灌入腳本（一次性管理工具）
 *
 * 來源：1200_ENGLISH/document/grade3~6.json
 *   - grade3/4/5：直接取用
 *   - grade6    ：若 document/ 內只有上層版（帶空白）就直接用；
 *                 若另存在子資料夾版（無空白、與音檔對齊），以子夾版為基底、
 *                 疊回上層版的 word/phonetic/pos/chinese/sentence 顯示欄位
 *
 * 目的地：Supabase RPC admin_load_words（security definer，secret 驗證）
 *   - 每個年級先送 {p_mode:'clear'} 清掉該年級舊資料，再分批 upsert
 *
 * 設定全部讀自 .env：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPA_SEED_SECRET
 * 用法：node scripts\seed-words.cjs
 */
const fs = require("fs");
const path = require("path");

/* ── 讀 .env ─────────────────────────────────────────────── */
const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const API_KEY = env.VITE_SUPABASE_ANON_KEY;
const SECRET = env.SUPA_SEED_SECRET;
if (!URL_BASE || !API_KEY || !SECRET) {
  console.error(".env 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPA_SEED_SECRET");
  process.exit(1);
}

/* ── 載入 JSON ───────────────────────────────────────────── */
const docDir = path.join(__dirname, "..", "1200_ENGLISH", "document");
if (!fs.existsSync(docDir)) {
  console.error("找不到 " + docDir + "，請確認資料已放入");
  process.exit(1);
}
const subDirs = fs
  .readdirSync(docDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

function loadRows(filePath, grade) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rows = [];
  for (const week of data.weeks ?? []) {
    for (const c of week.content ?? []) {
      if (!c.word || !c.chinese) {
        console.warn(`  ⚠ grade${grade} week${week.week} 缺 word/chinese，略過：${JSON.stringify(c).slice(0, 80)}`);
        continue;
      }
      rows.push({
        grade,
        week: week.week,
        word: c.word,
        phonetic: c.phonetic || null,
        pos: c.pos || null,
        chinese: c.chinese,
        sentence: c.sentence || null,
      });
    }
  }
  return rows;
}

/** 疊回顯示欄位用的比對鍵：小寫＋去空白與括號 */
const displayKey = (w) => w.toLowerCase().replace(/[\s()（）]/g, "");

function mergeGrade6() {
  if (!subDirs.length) {
    // 沒有子資料夾版 → 直接用上層版（帶空白的顯示版）
    const rows = loadRows(path.join(docDir, "grade6.json"), 6);
    console.log(`grade6：直接採用上層版 ${rows.length} 字（無子夾版可疊回）`);
    return rows;
  }
  // 基底：唯一的子資料夾版（完整、無空白）
  const baseRows = loadRows(path.join(docDir, subDirs[0], "grade6.json"), 6);
  // 疊回來源：上層版（帶空白的顯示版）
  const spacedRows = loadRows(path.join(docDir, "grade6.json"), 6);
  const spacedMap = new Map(spacedRows.map((r) => [displayKey(r.word), r]));
  let overlaid = 0;
  for (const r of baseRows) {
    const s = spacedMap.get(displayKey(r.word));
    if (s) {
      r.word = s.word; // 顯示用帶空白版
      r.phonetic = s.phonetic ?? r.phonetic;
      r.pos = s.pos ?? r.pos;
      r.chinese = s.chinese ?? r.chinese;
      r.sentence = s.sentence ?? r.sentence;
      overlaid++;
    }
  }
  console.log(`grade6：基底 ${baseRows.length} 字（子資料夾版），疊回上層版顯示欄位 ${overlaid} 字`);
  return baseRows;
}

const grades = {
  3: loadRows(path.join(docDir, "grade3.json"), 3),
  4: loadRows(path.join(docDir, "grade4.json"), 4),
  5: loadRows(path.join(docDir, "grade5.json"), 5),
  6: mergeGrade6(),
};

/* ── RPC 呼叫 ────────────────────────────────────────────── */
async function rpc(pMode, pBatch) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/admin_load_words`, {
    method: "POST",
    headers: { apikey: API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: SECRET, p_mode: pMode, p_batch: pBatch }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

const BATCH_SIZE = 250;

(async () => {
  for (const g of [3, 4, 5, 6]) {
    const rows = grades[g];
    console.log(`grade${g}：${rows.length} 字`);

    // 1) 清掉該年級舊資料（重灌覆蓋語意）
    await rpc("clear", [{ grade: g }]);

    // 2) 分批 upsert
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const n = JSON.parse(await rpc("upsert", batch));
      done += batch.length;
      console.log(`  批次 ${i / BATCH_SIZE + 1}：送出 ${batch.length} 筆，DB 回報 ${n} 筆寫入`);
    }
  }
  console.log("✅ 全部年級灌入完成");
})().catch((e) => {
  console.error("❌ 灌入失敗：", e.message);
  process.exit(1);
});
