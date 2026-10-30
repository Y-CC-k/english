import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./Quiz.css";

/** 管理者專區（獨立選單項目）：含 IP 的完整成績紀錄＋線上刪除。
 *  資料來源 SQL 函式 teacher_scores / delete_score，函式內會驗 profiles.role=1，非老師一律回 0 筆／false。 */
interface Row {
  id: string;
  created_at: string;
  name: string;
  grade: number;
  week: number;
  qtype: string | null;
  score: number;
  total?: number;
  ip: string | null;
}

const QTYPE_LABEL: Record<string, string> = { listen: "🎧 聽音選字", wordpick: "🔍 看義選詞" };

/** ISO 時間 →「10/22 14:30」樣式 */
function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const GRADES = ["3", "4", "5", "6"];

export default function AdminPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [bGrade, setBGrade] = useState("");
  const [bType, setBType] = useState("");
  const [bFrom, setBFrom] = useState("");   // 起始日 YYYY-MM-DD（空＝不限）
  const [bTo, setBTo] = useState("");       // 結束日（空＝不限）
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const sb = supabase();
    if (!sb) { setErr("Supabase 未設定"); setLoading(false); return; }
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await sb.rpc("teacher_scores");
      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  /** 🛠️ 刪除單筆成績（SQL 函式內驗老師身分） */
  async function removeScore(r: Row) {
    const sb = supabase();
    if (!sb || deletingId) return;
    if (!window.confirm(`確定要刪除「${r.name}（${r.grade} 年級・第 ${r.week} 週・${r.score}/${r.total ?? 10}）」這筆成績嗎？`)) return;
    setDeletingId(r.id);
    try {
      const { data, error } = await sb.rpc("delete_score", { p_id: r.id });
      if (error) throw error;
      if (!data) { setErr("刪除失敗：此帳號沒有管理者權限"); return; }
      setRows(prev => prev.filter(x => x.id !== r.id)); // 刪完直接從畫面移除
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  // 日期區間（本地時區：起日 00:00:00 ～ 訖日 23:59:59）
  const fromTs = bFrom ? Date.parse(`${bFrom}T00:00:00+08:00`) : Number.NEGATIVE_INFINITY;
  const toTs = bTo ? Date.parse(`${bTo}T23:59:59.999+08:00`) : Number.POSITIVE_INFINITY;

  const filtered = rows
    .filter(r =>
      (!bGrade || r.grade === Number(bGrade)) &&
      (!bType || r.qtype === bType) &&
      Date.parse(r.created_at) >= fromTs &&
      Date.parse(r.created_at) <= toTs
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="qz-panel">
      <h2 className="qz-title">🛠️ 管理者專區（含 IP · 可刪除成績）</h2>
      {err && <div className="qz-error">{err}</div>}

      <div className="qz-filters" style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={bGrade} onChange={(e) => setBGrade(e.target.value)}>
          <option value="">全部年級</option>
          {GRADES.map(g => <option key={g} value={g}>{g} 年級</option>)}
        </select>
        <select value={bType} onChange={(e) => setBType(e.target.value)}>
          <option value="">全部題型</option>
          <option value="listen">🎧 聽音選字</option>
          <option value="wordpick">🔍 看義選詞</option>
        </select>
        <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} aria-label="起始日" />
        <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} aria-label="結束日" />
        <button className="qz-ghost-btn"
          onClick={() => { setBFrom(""); setBTo(""); }}>
          ✕ 清除日期
        </button>
        <button className="qz-ghost-btn" onClick={() => void load()} disabled={loading}>
          🔄 重新整理
        </button>
        <span style={{ marginLeft: "auto", alignSelf: "center", color: "#64748b", fontSize: 13 }}>
          共 {filtered.length} 筆
        </span>
      </div>

      <div className="qz-table-wrap">
        <table className="qz-table">
          <thead>
            <tr><th>時間</th><th>姓名</th><th>年級</th><th>週次</th><th>題型</th><th>分數</th><th>IP</th><th>操作</th></tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="num">{fmtDateTime(r.created_at)}</td>
                <td>{r.name}</td>
                <td className="num">{r.grade}</td>
                <td className="num">第 {r.week} 週</td>
                <td>{r.qtype ? QTYPE_LABEL[r.qtype] ?? r.qtype : "—"}</td>
                <td className="num">{`${r.score} / ${r.total ?? 10}`}</td>
                <td className="num">{r.ip ?? "—"}</td>
                <td>
                  <button
                    className="qz-ghost-btn"
                    style={{ color: "#dc2626", borderColor: "#fecaca" }}
                    disabled={deletingId === r.id}
                    onClick={() => void removeScore(r)}
                  >
                    {deletingId === r.id ? "刪除中…" : "🗑️ 刪除"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} className="qz-empty">沒有紀錄</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
