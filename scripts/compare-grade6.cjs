// 一次性小腳本：比較 document\grade6.json 與 document\新增資料夾\grade6.json
// 用 JSON 解析來比（避免 console 編碼問題），只印摘要
const fs = require("fs");
const path = require("path");

const A = fs.readFileSync(path.join(__dirname, "..", "1200E", "document", "grade6.json"), "utf8");
const B = fs.readFileSync(
  fs
    .readdirSync(path.join(__dirname, "..", "1200E", "document"))
    .filter((n) => n.includes("grade6.json") === false && fs.statSync(path.join(__dirname, "..", "1200E", "document", n)).isDirectory())
    .map((n) => path.join(__dirname, "..", "1200E", "document", n, "grade6.json"))[0],
  "utf8",
);

const pa = JSON.parse(A);
const pb = JSON.parse(B);
const count = (p) =>
  p.weeks.map((w) => ({ week: w.week, n: (w.content ?? []).length }));
const ca = count(pa);
const cb = count(pb);
console.log("gradeName：上層＝", pa.gradeName, "｜重複夾＝", pb.gradeName);
console.log("上層各週字數：", JSON.stringify(ca));
console.log("重複夾各週字數：", JSON.stringify(cb));
const setA = new Set(
  pa.weeks.flatMap((w) => (w.content ?? []).map((c) => c.word + "|" + c.chinese)),
);
const setB = new Set(
  pb.weeks.flatMap((w) => (w.content ?? []).map((c) => c.word + "|" + c.chinese)),
);
const onlyA = [...setA].filter((x) => !setB.has(x)).slice(0, 10);
const onlyB = [...setB].filter((x) => !setA.has(x)).slice(0, 10);
console.log("只在上層有（前10）：", JSON.stringify(onlyA));
console.log("只在重複夾有（前10）：", JSON.stringify(onlyB));
