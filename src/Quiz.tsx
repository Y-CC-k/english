import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { speakWord, stopSpeech } from "./lib/speak";
import "./Quiz.css";

type Phase = "setup" | "quiz" | "result" | "board";

interface WordRow {
  id: string;
  grade: number;
  week: number;
  word: string;
  pos: string | null;
  chinese: string;
  sentence: string | null;
}

interface Question {
  word: string;      // 正解的英文單字
  chinese: string;   // 正解的中文
  listen: boolean;   // true=聽音選字（播單字、選英文）；false=看義選詞（顯中文、選英文）
  options: string[]; // 選項（聽音=中文們／看義=單字們）
}

interface DetailItem {
  word: string;
  chinese: string;
  chosen: string | null;
  correct: boolean;
}

interface ScoreRow {
  id?: string;
  name: string;
  grade: number;
  week: number;
  qtype: string | null;
  score: number;
  total?: number;
  created_at: string;
}

const QTYPE_LABEL: Record<string, string> = { listen: "🎧 聽音選字", wordpick: "🔍 看義選詞" };

/** ISO 時間 →「10/22 14:30」樣式（含日期與時間） */
function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

interface BoardSummary {
  name: string;
  grade: number;
  attempts: number;
  best: number;      // 最佳答對題數
  bestTotal: number; // 最佳那場的總題數（答對率排行＝best/bestTotal）
  average: number;   // 累計答對題數（答對率排行顯示「對/全部」＝average/sumTotal）
  sumTotal: number;  // 累計總題數
  lastAt: string;    // 最後一次考試時間（ISO）
}

const GRADES = [
  { value: "", label: "--請選擇--" },
  { value: "3", label: "三年級" },
  { value: "4", label: "四年級" },
  { value: "5", label: "五年級" },
  { value: "6", label: "六年級" },
];
const COUNTS = ["5", "10", "20", "all"];
const NAME_KEY = "quiz-name";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export default function Quiz({ guest, accountName, teacher, initialBoard }: {
  guest?: boolean;
  accountName?: string;
  teacher?: boolean;
  initialBoard?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(initialBoard ? "board" : "setup");
  // 註冊者：姓名預設其登入帳號（可改）；訪客：沿用這台裝置最後輸入的暱稱
  const [name, setName] = useState(() => accountName ?? localStorage.getItem(NAME_KEY) ?? "");
  const [grade, setGrade] = useState("");
  const [week, setWeek] = useState("");
  const [count, setCount] = useState("10");
  const [listen, setListen] = useState(true);

  const [pool, setPool] = useState<WordRow[]>([]);      // 該年級全部單字
  const [weekOptions, setWeekOptions] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 作答狀態
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem[]>([]);
  const detailRef = useRef<DetailItem[]>([]); // 存檔用（state 更新有 race，ref 即時）
  const [score, setScore] = useState(0);
  const [saveErr, setSaveErr] = useState("");
  const [finishAt, setFinishAt] = useState(""); // 本次交卷時間（顯示在結果頁）
  // 錯誤加題：用 ref 記進度與總數（答錯時加一題重考），避免 setTimeout 讀到舊 state
  const qIndexRef = useRef(0);
  const qCountRef = useRef(0);
  const origCountRef = useRef(0); // 原始題數（加題上限用）

  // 成績板
  const [summary, setSummary] = useState<BoardSummary[]>([]);
  const [recent, setRecent] = useState<ScoreRow[]>([]);
  const [bGrade, setBGrade] = useState("");   // "" = 全部年級
  const [bWeek, setBWeek] = useState("");     // "" = 全部週次
  const [bWeeks, setBWeeks] = useState<number[]>([]);
  const [bType, setBType] = useState("");     // "" = 兩種題型都列
  const [bSort, setBSort] = useState("best"); // best / average / attempts / name / latest / oldest
  const nextTimer = useRef<number | null>(null);
  // 老師專區：老師登入才另外抓含 IP 的完整紀錄（SQL 函式 teacher_scores 本身管權限）
  const [teacherRows, setTeacherRows] = useState<(ScoreRow & { ip: string | null })[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 🛠️ 管理者刪除單筆成績（SQL 函式內驗 teacher 身分） */
  async function removeScore(r: ScoreRow & { ip?: string | null }) {
    const sb = supabase();
    if (!r.id || !sb || deletingId) return;
    if (!window.confirm(`確定要刪除「${r.name}（${r.grade} 年級・第 ${r.week} 週・${r.score} 分）」這筆成績嗎？`)) return;
    setDeletingId(r.id);
    try {
      const { data, error } = await sb.rpc("delete_score", { p_id: r.id });
      if (error) throw error;
      if (!data) { setErr("刪除失敗：此帳號沒有管理者權限"); return; }
      await loadBoard(bGrade, bWeek, bType); // 刪完重抓
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  /* ── 取得本機公網 IP（成績記錄用；抓不到就留空，不影響作答） ── */
  const [ip, setIp] = useState("");
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetch("https://api.ipify.org?format=json", { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { ip?: string }) => { if (alive && d.ip) setIp(d.ip); })
      .catch(() => { /* 抓不到就留空 */ })
      .finally(() => window.clearTimeout(timer));
    return () => { alive = false; controller.abort(); };
  }, []);

  /* ── 選年級 → 一次撈全年級單字（含週次選單）──────── */
  async function handleGradeChange(g: string) {
    setGrade(g);
    setWeek("");
    setWeekOptions([]);
    setPool([]);
    setErr("");
    stopSpeech();
    if (!g) return;
    const sb = supabase();
    if (!sb) { setErr("Supabase 未設定"); return; }
    setLoading(true);
    try {
      const rows = unwrap<WordRow>(await sb.from("words").select("*").eq("grade", Number(g)));
      setPool(rows);
      setWeekOptions([...new Set(rows.map((r) => r.week))].sort((a, b) => a - b));
      if (rows.length === 0) setErr("這個年級目前沒有單字資料。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const weekSubset = pool.filter((r) => week !== "" && r.week === Number(week));

  /* ── 開始評量 → 建題目 ─────────────────────── */
  function startQuiz() {
    if (!name.trim()) { setErr("請先填姓名（成績板要顯示的名字）"); return; }
    if (!grade || !week) { setErr("請選年級與週次"); return; }
    if (weekSubset.length === 0) { setErr("這一週沒有單字，換一週試試"); return; }
    const n = count === "all" ? weekSubset.length : Math.min(Number(count), weekSubset.length);
    // 取樣 N 題；干擾項：聽音題用「不同中文」、看義題用「同池不同單字」
    const allWords = [...new Set(pool.map((r) => r.word))];
    const qs: Question[] = shuffle(weekSubset).slice(0, n).map((w) => {
      const d = shuffle(allWords.filter((x) => x !== w.word)).slice(0, 3).concat(w.word);
      return {
        word: w.word,
        chinese: w.chinese,
        listen,
        options: shuffle(d),
      };
    });
    setQuestions(qs);
    qIndexRef.current = 0;
    qCountRef.current = qs.length;
    origCountRef.current = qs.length;
    setQIndex(0);
    setChosen(null);
    setDetail([]);
    detailRef.current = [];
    setScore(0);
    setSaveErr("");
    setErr("");
    if (!accountName) localStorage.setItem(NAME_KEY, name.trim()); // 訪客暱稱才記憶；註冊者用帳號不寫入
    setPhase("quiz");
  }

  /* ── 聽音題：進題自動播一次 ─────────────────── */
  const q = questions[qIndex];
  useEffect(() => {
    if (phase !== "quiz" || !q || !listen) return;
    speakWord(q.word, 0.75);
    return () => stopSpeech();
  }, [phase, qIndex, questions, listen]);

  useEffect(() => () => stopSpeech(), []);

  /* ── 作答 ─────────────────────────────── */
  function answer(option: string) {
    if (chosen !== null || !q) return;
    const correct = option === q.word;
    setChosen(option);
    const item: DetailItem = { word: q.word, chinese: q.chinese, chosen: option, correct };
    setDetail((d) => [...d, item]);
    detailRef.current = [...detailRef.current, item];
    if (correct) setScore((s) => s + 1);
    else {
      // ❌ 錯誤加題：這個單字排到隊伍最後再考一次（上限＝原題數的 2 倍，避免無限加）
      if (qCountRef.current < origCountRef.current * 2) {
        const retry: Question = { word: q.word, chinese: q.chinese, listen: q.listen, options: shuffle(q.options) };
        setQuestions((prev) => [...prev, retry]);
        qCountRef.current += 1;
      }
    }
    nextTimer.current = window.setTimeout(() => {
      setChosen(null);
      qIndexRef.current += 1;
      if (qIndexRef.current < qCountRef.current) setQIndex(qIndexRef.current);
      else void finish(detailRef.current.filter((x) => x.correct).length);
    }, 1200);
  }

  /* ── 收卷 → 存入 scores ─────────────────── */
  async function finish(finalScore: number) {
    stopSpeech();
    const sb = supabase();
    if (sb) {
      const { error } = await sb.from("scores").insert({
        name: name.trim().slice(0, 10),
        grade: Number(grade),
        week: Number(week),
        qtype: listen ? "listen" : "wordpick",
        score: finalScore,
        total: qCountRef.current, // 總題數＝原始題數＋答錯加題（成績板算答對率「對/全部」用）
        detail: detailRef.current,
        ...(ip ? { ip } : {}), // 本機公網 IP（抓不到就略過）
      });
      if (error) setSaveErr(`成績存檔失敗：${error.message}`);
    } else {
      setSaveErr("Supabase 未設定，成績無法存檔");
    }
    setFinishAt(new Date().toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }));
    setPhase("result");
  }

  useEffect(() => () => {
    if (nextTimer.current) window.clearTimeout(nextTimer.current);
  }, []);

  /* ── 成績板 ─────────────────────────────── */
  function openBoard() {
    setBGrade(grade);           // 預設帶入目前考的年級
    setBWeek("");
    setBSort("best");
    setPhase("board");
  }

  /** 依年級／週次／題型撈原始紀錄並在前端聚合（summary 聚合、recent 取最新 20 筆） */
  async function loadBoard(g: string, w: string, t: string) {
    const sb = supabase();
    if (!sb) return;
    setLoading(true);
    try {
      let query = sb.from("scores").select("name, grade, week, qtype, score, total, created_at");
      if (g) query = query.eq("grade", Number(g));
      if (w) query = query.eq("week", Number(w));
      if (t) query = query.eq("qtype", t);
      query = query.order("created_at", { ascending: false });
      const rows = unwrap<ScoreRow>(await query);
      setRecent(rows.slice(0, 20));

      // 週次選單：該年級實際有紀錄的週（不受週次篩選影響）
      let wq = sb.from("scores").select("week");
      if (g) wq = wq.eq("grade", Number(g));
      setBWeeks([...new Set(unwrap<{ week: number }>(await wq).map((r) => r.week))].sort((a, b) => a - b));

      // 聚合：依 姓名+年級 分組（紀錄已依時間新→舊排序，第一筆即最後一次考試）
      const map = new Map<string, BoardSummary>();
      for (const r of rows) {
        const key = `${r.name}|${r.grade}`;
        const tot = r.total ?? 0;
        const e = map.get(key) ?? { name: r.name, grade: r.grade, attempts: 0, best: 0, bestTotal: 0, average: 0, sumTotal: 0, lastAt: "" };
        e.attempts++;
        if (r.score > e.best || (r.score === e.best && tot > e.bestTotal)) { e.best = r.score; e.bestTotal = tot; }
        e.average += r.score; // 先當累計答對數，最後顯示「對/全部」
        e.sumTotal += tot;
        if (!e.lastAt) e.lastAt = r.created_at;
        map.set(key, e);
      }
      setSummary([...map.values()]);

      // 老師專區（SQL 函式本身會驗身分，非老師回 0 筆）
      if (teacher) {
        try {
          setTeacherRows(unwrap<ScoreRow & { ip: string | null }>(await sb.rpc("teacher_scores")));
        } catch {
          setTeacherRows([]);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 進成績板畫面時載入一次
  useEffect(() => {
    if (phase === "board") void loadBoard(bGrade, bWeek, bType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** 答對率（同分丟給排序當次要條件）：最佳那場 best/bestTotal；平均＝累計對/累計全部 */
  const bestRate = (s: BoardSummary) => (s.bestTotal ? s.best / s.bestTotal : s.best);
  const avgRate = (s: BoardSummary) => (s.sumTotal ? s.average / s.sumTotal : s.average);

  const sortedSummary = [...summary].sort((a, b) => {
    switch (bSort) {
      case "average":  return avgRate(b) - avgRate(a) || bestRate(b) - bestRate(a);
      case "attempts": return b.attempts - a.attempts || bestRate(b) - bestRate(a);
      case "name":     return a.name.localeCompare(b.name, "zh-Hant");
      case "latest":   return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime() || bestRate(b) - bestRate(a);
      case "oldest":   return new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime() || bestRate(b) - bestRate(a);
      default:         return bestRate(b) - bestRate(a) || avgRate(b) - avgRate(a);
    }
  });
  // 顯示用：最佳「對/全部」
  const fmtFrac = (n: number, d: number) => (d ? `${n}/${d}` : `${n}`);

  /* ── 結果頁遊戲化元素 ── */
  const correctCount = detail.filter((d) => d.correct).length;
  const ratio = questions.length ? correctCount / questions.length : 0;
  const medal = ratio === 1 ? "🏆" : ratio >= 0.8 ? "🥇" : ratio >= 0.6 ? "🥈" : "💪";
  const resultTitle = ratio === 1 ? "全對！太厲害了！" : ratio >= 0.8 ? "做得好！" : ratio >= 0.6 ? "不錯喔！" : "繼續加油！";
  const CONFETTI = ["🎉", "⭐", "🎊", "✨", "🎈", "🍬"];

  return (
    <div className="ws-root">
      <div className="ws-orbs" aria-hidden="true">
        <div className="ws-orb ws-orb-1" />
        <div className="ws-orb ws-orb-2" />
        <div className="ws-orb ws-orb-3" />
        <div className="ws-orb ws-orb-4" />
      </div>

      <header className="ws-header">
        <div className="ws-header-content">
          <div className="ws-header-brand">
            <div className="ws-header-logo" aria-hidden="true">Q</div>
            <div>
              <h1 className="ws-header-title">評量活動{guest && "（🎮 訪客模式）"}</h1>
              <p className="ws-header-subtitle">
                {guest ? "成績以你輸入的暱稱記錄" : "聽音選字／看義選詞 · 成績自動寫入 Supabase"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {phase === "setup" && (
        <div className="qz-panel">
          <h2 className="qz-title">📝 準備開始</h2>
          {err && <div className="qz-error">{err}</div>}
          <div className="qz-field">
            <label>姓名（顯示在成績板{accountName ? "，預設為您的帳號" : ""}，最多 10 字）</label>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 10))} placeholder="例如：王小明" maxLength={10} />
          </div>
          <div className="qz-grid2">
            <div className="qz-field">
              <label>年級</label>
              <select value={grade} onChange={(e) => void handleGradeChange(e.target.value)}>
                {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="qz-field">
              <label>週次</label>
              <select value={week} disabled={!grade || loading || weekOptions.length === 0}
                onChange={(e) => setWeek(e.target.value)}>
                <option value="">--請選擇--</option>
                {weekOptions.map((n) => <option key={n} value={n}>第 {n} 週</option>)}
              </select>
            </div>
            <div className="qz-field">
              <label>題數</label>
              <select value={count} onChange={(e) => setCount(e.target.value)}>
                {COUNTS.map((c) => <option key={c} value={c}>{c === "all" ? "全部" : c + " 題"}</option>)}
              </select>
            </div>
            <div className="qz-field">
              <label>題型</label>
              <select value={listen ? "listen" : "wordpick"} onChange={(e) => setListen(e.target.value === "listen")}>
                <option value="listen">🎧 聽音選字（播單字 → 選英文）</option>
                <option value="wordpick">🔍 看義選詞（顯中文 → 選單字）</option>
              </select>
            </div>
          </div>
          <div className="qz-btn-row">
            <button className="qz-start-btn" disabled={loading || pool.length === 0} onClick={startQuiz}>
              開始評量
            </button>
          </div>
          <p className="qz-score-sub">
            {week && `這一週有 ${weekSubset.length} 字`}
            {week && count !== "all" && Number(count) > weekSubset.length
              && `　⚠️ 選題不足 → 以本週最大值 ${weekSubset.length} 題進行`}
            　·　評量結束會自動存進全班成績板
          </p>
        </div>
      )}

      {phase === "quiz" && q && (
        <div className="qz-panel">
          <div className="qz-progress">
            <span>第 <b>{qIndex + 1}</b> / {questions.length} 題</span>
            <span>目前對 <b>{score}</b> 題</span>
          </div>
          <div className="qz-prompt">
            {q.listen ? (
              <>
                <button className="qz-play-big" onClick={() => speakWord(q.word, 0.75)} aria-label="播放單字">▶</button>
                <span className="qz-prompt-hint">🎧 聽！哪個英文單字是這個發音？
                  （點 ▶ 可以重聽）</span>
              </>
            ) : (
              <>
                <p className="qz-prompt-chinese">{q.chinese}</p>
                <span className="qz-prompt-hint">🔍 哪個英文單字的意思是這個？</span>
              </>
            )}
          </div>
          <div className="qz-options">
            {q.options.map((o) => {
              const ans = q.word;
              const cls =
                chosen === null ? "" : o === ans ? "correct" : o === chosen ? "wrong" : "";
              return (
                <button
                  key={o}
                  className={`qz-option ${cls}`}
                  disabled={chosen !== null}
                  onClick={() => answer(o)}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="qz-panel qz-result">
          <div className="qz-confetti" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <span key={i} style={{
                left: `${(i * 97) % 100}%`,
                fontSize: `${12 + ((i * 7) % 15)}px`,
                animationDuration: `${2 + (i % 5) * 0.7}s`,
                animationDelay: `${(i % 8) * 0.3}s`,
              }}>{CONFETTI[i % CONFETTI.length]}</span>
            ))}
          </div>
          <div className="qz-result-medal" aria-hidden="true">{medal}</div>
          <h2 className="qz-result-title">{resultTitle}</h2>
          {saveErr && <div className="qz-error">{saveErr}</div>}
          <p className="qz-score-big">{correctCount} / {questions.length}</p>
          <p className="qz-score-sub">
            {name.trim()}　·　{grade} 年級　第 {week} 週　·　
            {detail.length === 0 ? "沒有作答" : `正確率 ${Math.round(ratio * 100)}%`}
            {finishAt && <>　·　📅 {finishAt}</>}
          </p>
          <div className="qz-detail-list">
            {detail.map((d, i) => (
              <div className="qz-detail-item" key={i}>
                <span className={`qz-badge ${d.correct ? "ok" : "ng"}`}>{d.correct ? "O" : "X"}</span>
                <b>{d.word}</b>
                <span>＝ {d.chinese}</span>
                {!d.correct && d.chosen && <span>（你選了「{d.chosen}」）</span>}
              </div>
            ))}
          </div>
          <div className="qz-btn-row">
            <button className="qz-start-btn" onClick={() => setPhase("setup")}>🔁 再玩一次</button>
            <button className="qz-ghost-btn" onClick={() => void openBoard()}>📊 看全班成績板</button>
          </div>
        </div>
      )}

      {phase === "board" && (
        <div className="qz-panel qz-panel-wide">
          <h2 className="qz-title">📊 全班成績板</h2>
          <div className="qz-board-controls">
            <div className="qz-field">
              <label>年級</label>
              <select
                value={bGrade}
                disabled={loading}
                onChange={(e) => { setBGrade(e.target.value); setBWeek(""); void loadBoard(e.target.value, "", bType); }}
              >
                <option value="">全部年級</option>
                <option value="3">三年級</option>
                <option value="4">四年級</option>
                <option value="5">五年級</option>
                <option value="6">六年級</option>
              </select>
            </div>
            <div className="qz-field">
              <label>週次</label>
              <select
                value={bWeek}
                disabled={loading}
                onChange={(e) => { setBWeek(e.target.value); void loadBoard(bGrade, e.target.value, bType); }}
              >
                <option value="">全部週次</option>
                {bWeeks.map((n) => <option key={n} value={n}>第 {n} 週</option>)}
              </select>
            </div>
            <div className="qz-field">
              <label>題型</label>
              <select
                value={bType}
                disabled={loading}
                onChange={(e) => { setBType(e.target.value); void loadBoard(bGrade, bWeek, e.target.value); }}
              >
                <option value="">全部題型</option>
                <option value="listen">🎧 聽音選字</option>
                <option value="wordpick">🔍 看義選詞</option>
              </select>
            </div>
            <div className="qz-field">
              <label>排序</label>
              <select value={bSort} onChange={(e) => setBSort(e.target.value)}>
                <option value="best">🏆 最佳分數</option>
                <option value="average">📈 平均分數</option>
                <option value="attempts">🔁 考試次數</option>
                <option value="name">🔤 姓名筆畫</option>
                <option value="latest">🕘 最新考試（新→舊）</option>
                <option value="oldest">🕗 最初考試（舊→新）</option>
              </select>
            </div>
          </div>
          {err && <div className="qz-error">{err}</div>}

          {teacher && (
            <>
              <h2 className="qz-title" style={{ marginTop: 8 }}>🛠️ 管理者專區（含 IP · 可刪除成績）</h2>
              <div className="qz-table-wrap">
                <table className="qz-table">
                  <thead>
                    <tr><th>時間</th><th>姓名</th><th>年級</th><th>週次</th><th>題型</th><th>分數</th><th>IP</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {teacherRows.map((r, i) => (
                      <tr key={i}>
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
                    {teacherRows.length === 0 && !loading && (
                      <tr><td colSpan={8} className="qz-empty">沒有紀錄</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="qz-table-wrap">
            <table className="qz-table">
              <thead>
                <tr><th>姓名</th>{!bGrade && <th>年級</th>}<th>考過次數</th><th>最佳</th><th>平均</th><th>最後考試</th></tr>
              </thead>
              <tbody>
                {sortedSummary.map((s) => (
                  <tr key={`${s.name}|${s.grade}`} className={s.name === name.trim() ? "me" : ""}>
                    <td>{s.name}{s.name === name.trim() ? "（我）" : ""}</td>
                    {!bGrade && <td className="num">{s.grade}</td>}
                    <td className="num">{s.attempts}</td>
                    <td className="num">{fmtFrac(s.best, s.bestTotal)}</td>
                    <td className="num">{fmtFrac(s.average, s.sumTotal)}</td>
                    <td className="num">{fmtDateTime(s.lastAt)}</td>
                  </tr>
                ))}
                {sortedSummary.length === 0 && !loading && (
                  <tr><td colSpan={bGrade ? 5 : 6} className="qz-empty">這個範圍目前沒有成績紀錄</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <h2 className="qz-title" style={{ marginTop: 8 }}>🕘 最近紀錄（最新 20 筆）</h2>
          <div className="qz-table-wrap">
            <table className="qz-table">
              <thead>
                <tr><th>時間</th><th>姓名</th><th>年級</th><th>週次</th><th>題型</th><th>分數</th></tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{fmtDateTime(r.created_at)}</td>
                    <td>{r.name}</td>
                    <td className="num">{r.grade}</td>
                    <td className="num">第 {r.week} 週</td>
                    <td>{r.qtype ? QTYPE_LABEL[r.qtype] ?? r.qtype : "—"}</td>
                    <td className="num">{`${r.score} / ${r.total ?? 10}`}</td>
                  </tr>
                ))}
                {recent.length === 0 && !loading && (
                  <tr><td colSpan={6} className="qz-empty">沒有紀錄</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="qz-btn-row">
            <button className="qz-ghost-btn" onClick={() => setPhase("setup")}>← 回準備頁</button>
          </div>
        </div>
      )}
    </div>
  );
}
