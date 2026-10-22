import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

interface Row {
  name: string;
  grade: number;
  week: number;
  qtype: string | null;
  score: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** 首頁分數排行榜：取前 10 高分（單場考試），同分以較新者在前；可選年級或年級＋週次。 */
export default function Leaderboard() {
  const [grade, setGrade] = useState("");
  const [week, setWeek] = useState("");
  const [bWeeks, setBWeeks] = useState<number[]>([]);
  const [bType, setBType] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        let query = sb.from("scores").select("name, grade, week, qtype, score");
        if (grade) query = query.eq("grade", Number(grade));
        if (week) query = query.eq("week", Number(week));
        if (bType) query = query.eq("qtype", bType);
        query = query.order("score", { ascending: false }).order("created_at", { ascending: false }).limit(10);
        const { data, error } = await query;
        if (!alive) return;
        setRows(error ? [] : (data ?? []));

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
  }, [grade, week, bType]);

  return (
    <div className="lb">
      <div className="lb-head">
        <h2>🏆 分數排行榜</h2>
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
            <option value="listen">🎧 聽音選義</option>
            <option value="wordpick">🔍 看義選詞</option>
          </select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="lb-empty">{loading ? "載入中…" : "還沒有成績紀錄，去考一場吧！"}</p>
      ) : (
        <ol className="lb-list">
          {rows.map((r, i) => (
            <li key={i} className={i < 3 ? "top" : ""}>
              <span className="lb-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
              <b className="lb-name">{r.name}</b>
              <span className="lb-meta">{r.grade} 年級 · 第 {r.week} 週</span>
              {r.qtype && <span className="lb-qtype">{r.qtype === "listen" ? "🎧 聽音" : "🔍 看義"}</span>}
              <span className="lb-score">{r.score} 分</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
