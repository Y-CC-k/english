import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

interface Row {
  name: string;
  grade: number;
  week: number;
  qtype: string | null;
  score: number;
  total?: number;
  created_at?: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** 首頁分數排行榜：答對率排行（依 score/total 排序，取前 10 名）；可切換「累計」或「今日」範圍，另可選年級／週次／題型。 */
export default function Leaderboard() {
  const [grade, setGrade] = useState("");
  const [week, setWeek] = useState("");
  const [bWeeks, setBWeeks] = useState<number[]>([]);
  const [bType, setBType] = useState("");
  const [range, setRange] = useState<"all" | "today">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        let query = sb.from("scores").select("name, grade, week, qtype, score, total, created_at");
        if (range === "today") {
          // 今天凌晨 0 點（本地時區）之後的成績
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          query = query.gte("created_at", start.toISOString());
        }
        if (grade) query = query.eq("grade", Number(grade));
        if (week) query = query.eq("week", Number(week));
        if (bType) query = query.eq("qtype", bType);
        query = query.order("score", { ascending: false }).order("created_at", { ascending: false }).limit(30);
        const { data, error } = await query;
        if (!alive) return;
        // 答對率排行：答對率 = score / total（取前 10 名）
        const sorted = [...(data ?? [])].sort((a, b) =>
          (b.score / (b.total ?? 10)) - (a.score / (a.total ?? 10)) || (b.total ?? 0) - (a.total ?? 0)
        ).slice(0, 10);
        setRows(error ? [] : sorted);

        // 週次選單：該年級實際有紀錄的週（不受週次篩選影響）
        let wq = sb.from("scores").select("week");
        if (grade) wq = wq.eq("grade", Number(grade));
        const { data: wk } = await wq;
        if (alive) setBWeeks([...new Set((wk ?? []).map((r) => r.week))].sort((a, b) => a - b));
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [grade, week, bType, range]);

  return (
    <div className="lb">
      <div className="lb-head">
        <div className="lb-title-row">
          <h2>{range === "today" ? "☀️ 今日排行榜" : "🏆 分數排行榜"}</h2>
          <div className="lb-tabs">
            <button className={range === "all" ? "lb-tab active" : "lb-tab"} onClick={() => setRange("all")}>🏆 累計排行</button>
            <button className={range === "today" ? "lb-tab active" : "lb-tab"} onClick={() => setRange("today")}>☀️ 今日排名</button>
          </div>
        </div>
        <div className="lb-selects">
          <select value={grade} onChange={(e) => { setGrade(e.target.value); setWeek(""); }}>
            <option value="">全部年級</option>
            <option value="3">三年級</option>
            <option value="4">四年級</option>
            <option value="5">五年級</option>
            <option value="6">六年級</option>
          </select>
          <select value={week} disabled={!grade} onChange={(e) => setWeek(e.target.value)}>
            <option value="">全部週次</option>
            {bWeeks.map((n) => <option key={n} value={n}>第 {n} 週</option>)}
          </select>
          <select value={bType} onChange={(e) => setBType(e.target.value)}>
            <option value="">全部題型</option>
            <option value="listen">🎧 聽音選字</option>
            <option value="wordpick">🔍 看義選詞</option>
          </select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="lb-empty">{loading ? "載入中…" : range === "today" ? "今天還沒有成績，去考一場吧！" : "還沒有成績紀錄，去考一場吧！"}</p>
      ) : (
        <ol className="lb-list">
          {rows.map((r, i) => (
            <li key={i} className={i < 3 ? "top" : ""}>
              <span className="lb-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
              <b className="lb-name">{r.name}</b>
              <span className="lb-meta">{r.grade} 年級 · 第 {r.week} 週</span>
              {r.qtype && <span className="lb-qtype">{r.qtype === "listen" ? "🎧 聽音選字" : "🔍 看義選詞"}</span>}
              <span className="lb-score">
                {`${r.score}/${r.total ?? 10}`}
                {range === "today" && r.created_at && <span className="lb-time"> {new Date(r.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
