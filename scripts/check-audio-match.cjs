// 一次性小腳本：檢查四個年級的每個單字在 Audio/GradeN/週 NN 資料夾中能否找到對應 mp3
// 同時比對「原始字（含空白）」與「去空白字」兩種檔名命中率
const fs = require("fs");
const path = require("path");

const doc = path.join(__dirname, "..", "1200E", "document");
const audioRoot = path.join(__dirname, "..", "1200E", "Audio");

const safe = (w) => w.toLowerCase().replace(/[\(\)]/g, "").trim();

for (const grade of [3, 4, 5, 6]) {
  const data = JSON.parse(fs.readFileSync(path.join(doc, `grade${grade}.json`), "utf8"));
  let total = 0, hitPlain = 0, hitNoSpace = 0, hitEither = 0;
  const missPlain = [], missAll = [];
  for (const wk of data.weeks) {
    const sub = path.join(audioRoot, `Grade${grade}`, String(wk.week).padStart(2, "0"));
    for (const c of wk.content ?? []) {
      total++;
      const plain = path.join(sub, `${safe(c.word)}.mp3`);
      const nospace = path.join(sub, `${safe(c.word).replace(/\s+/g, "")}.mp3`);
      const hasPlain = fs.existsSync(plain);
      const hasNospace = fs.existsSync(nospace);
      if (hasPlain) hitPlain++;
      if (hasNospace) hitNoSpace++;
      if (hasPlain || hasNospace) hitEither++;
      else missAll.push(`${wk.week}週:${c.word}`);
      if (!hasPlain && hasNospace) missPlain.push(`${wk.week}週:${c.word}`);
    }
  }
  console.log(
    `Grade${grade}：共 ${total} 字｜檔名含空白命中 ${hitPlain}｜去空白命中 ${hitNoSpace}｜任一命中 ${hitEither}`,
  );
  if (missPlain.length) console.log(`  （${missPlain.length} 字需要去空白檔名才對得上，例：${missPlain.slice(0, 8).join("、")}）`);
  if (missAll.length) console.log(`  ✖ 兩種檔名都找不到 ${missAll.length} 字，例：${missAll.slice(0, 10).join("、")}${missAll.length > 10 ? "…" : ""}`);
}
