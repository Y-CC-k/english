import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { speakSequence, stopSpeech } from "./lib/speak";
import "./WordStudy.css";

interface WordRow {
  id: string;
  grade: number;
  week: number;
  word: string;
  phonetic: string | null;
  pos: string | null;
  chinese: string;
  sentence: string | null;
}

const GRADES = [
  { value: "", label: "--請選擇--" },
  { value: "3", label: "三年級" },
  { value: "4", label: "四年級" },
  { value: "5", label: "五年級" },
  { value: "6", label: "六年級" },
];

export default function WordStudy({ onBack }: { onBack: () => void }) {
  const [grade, setGrade] = useState("");
  const [week, setWeek] = useState("");
  const [weekOptions, setWeekOptions] = useState<number[]>([]);
  const [words, setWords] = useState<WordRow[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingWords, setLoadingWords] = useState(false);
  const [error, setError] = useState("");

  const [playingId, setPlayingId] = useState<string | null>(null);

  // 教學模式
  const [teaching, setTeaching] = useState(false);
  const [teachIndex, setTeachIndex] = useState(0);
  const teachTimer = useRef<number | null>(null);

  /* ── 選年級 → 從 words 表撈該年級有哪些週 ─────────── */
  async function handleGradeChange(g: string) {
    setGrade(g);
    setWeek("");
    setWeekOptions([]);
    setWords([]);
    setError("");
    stopSpeech();
    if (!g) return;
    const sb = supabase();
    if (!sb) { setError("Supabase 未設定"); return; }
    setLoadingWeeks(true);
    const { data, error: err } = await sb
      .from("words")
      .select("week")
      .eq("grade", Number(g))
      .order("week", { ascending: true });
    setLoadingWeeks(false);
    if (err) { setError(`讀取週次失敗：${err.message}`); return; }
    const unique = [...new Set((data ?? []).map((d: { week: number }) => d.week))];
    setWeekOptions(unique);
    if (unique.length === 0) setError("這個年級目前沒有單字資料（words 是空的？）");
  }

  /* ── 選週次 → 撈該年級該週所有單字 ───────────────── */
  async function handleWeekChange(w: string) {
    setWeek(w);
    setWords([]);
    setError("");
    stopSpeech();
    if (!grade || !w) return;
    const sb = supabase();
    if (!sb) { setError("Supabase 未設定"); return; }
    setLoadingWords(true);
    const { data, error: err } = await sb
      .from("words")
      .select("*")
      .eq("grade", Number(grade))
      .eq("week", Number(w))
      .order("word", { ascending: true });
    setLoadingWords(false);
    if (err) { setError(`讀取單字失敗：${err.message}`); return; }
    const rows = (data ?? []) as WordRow[];
    setWords(rows);
    if (rows.length === 0) setError("這個組合沒有找到任何單字。");
  }

  /* ── 卡片：單字→停頓→例句 ────────────────────── */
  async function playCard(w: WordRow) {
    if (playingId) return;
    setPlayingId(w.id);
    await speakSequence([
      { text: w.word, rate: 0.75 },
      ...(w.sentence ? [{ text: w.sentence, rate: 0.8 }] : []),
    ]);
    setPlayingId(null);
  }

  /* ── 教學模式：播完 + 1.5 秒後自動下一位 ────────── */
  useEffect(() => {
    if (!teaching || words.length === 0) return;
    let cancelled = false;
    const w = words[teachIndex];
    void speakSequence([
      { text: w.word, rate: 0.7 },
      ...(w.sentence ? [{ text: w.sentence, rate: 0.75 }] : []),
    ]).then(() => {
      if (cancelled) return;
      teachTimer.current = window.setTimeout(() => {
        if (!cancelled) setTeachIndex((i) => (i + 1) % words.length);
      }, 1500);
    });
    return () => {
      cancelled = true;
      if (teachTimer.current) window.clearTimeout(teachTimer.current);
      stopSpeech();
    };
  }, [teaching, teachIndex, words]);

  /* ── Escape 關閉教學模式 ─────────────────────── */
  useEffect(() => {
    if (!teaching) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTeaching(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [teaching]);

  function exitTeaching() {
    setTeaching(false);
    stopSpeech();
  }

  const teachWord = words[teachIndex];
  const canTeach = words.length > 0 && !loadingWeeks && !loadingWords;

  return (
    <div className="ws-root">
      <div className="ws-orbs" aria-hidden="true">
        <div className="ws-orb ws-orb-1" />
        <div className="ws-orb ws-orb-2" />
        <div className="ws-orb ws-orb-3" />
        <div className="ws-orb ws-orb-4" />
      </div>

      <header className="ws-header" role="banner">
        <div className="ws-header-content">
          <div className="ws-header-brand">
            <div className="ws-header-logo" aria-hidden="true">V</div>
            <div>
              <h1 className="ws-header-title">英文單字學習網（資料庫版）</h1>
              <p className="ws-header-subtitle">臺中市清水區槺榔國民小學 · Supabase words</p>
            </div>
          </div>
          <button className="ws-back-btn" onClick={onBack}>← 返回</button>
        </div>
      </header>

      <div className="ws-controls">
        <div className="ws-select-group">
          <label htmlFor="ws-grade">選擇年級：</label>
          <select
            id="ws-grade"
            value={grade}
            onChange={(e) => void handleGradeChange(e.target.value)}
          >
            {GRADES.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div className="ws-select-group">
          <label htmlFor="ws-week">選擇週次：</label>
          <select
            id="ws-week"
            value={week}
            disabled={!grade || loadingWeeks || weekOptions.length === 0}
            onChange={(e) => void handleWeekChange(e.target.value)}
          >
            <option value="">--請選擇--</option>
            {weekOptions.map((n) => (
              <option key={n} value={n}>第 {n} 週</option>
            ))}
          </select>
        </div>
        <button
          className="ws-teach-btn"
          disabled={!canTeach}
          onClick={() => { setTeachIndex(0); setTeaching(true); }}
        >
          教學模式
        </button>
      </div>

      <main className="ws-grid" role="main">
        {(loadingWeeks || loadingWords) && <p className="ws-message">正在載入…</p>}
        {!loadingWeeks && !loadingWords && error && <p className="ws-message">{error}</p>}
        {!loadingWeeks && !loadingWords && !error && !grade && (
          <p className="ws-message">請選擇年級與週次來開始學習</p>
        )}
        {words.map((w) => (
          <div className="ws-card" key={w.id}>
            <div className="ws-card-info">
              <h2 className="ws-card-word">{w.word}</h2>
              <p className="ws-card-phonetic">{w.phonetic ?? ""}</p>
              <p className="ws-card-details">
                {w.pos && <span className="ws-card-pos">{w.pos}</span>}
                {w.chinese}
              </p>
              <p className="ws-card-sentence">{w.sentence ?? ""}</p>
            </div>
            <button
              className="ws-play-btn"
              disabled={playingId !== null}
              onClick={() => void playCard(w)}
              aria-label={`播放 ${w.word} 發音`}
            >
              {playingId === w.id ? "⏳" : "▶"}
            </button>
          </div>
        ))}
      </main>

      {teaching && teachWord && (
        <div className="ws-modal" role="dialog" aria-modal="true">
          <div className="ws-modal-card">
            <button className="ws-close-btn" onClick={exitTeaching} aria-label="關閉教學模式">
              ×
            </button>
            <h2 className="ws-modal-word">{teachWord.word}</h2>
            <p className="ws-modal-phonetic">{teachWord.phonetic ?? ""}</p>
            <p className="ws-modal-details">
              {teachWord.pos && <span className="ws-card-pos">{teachWord.pos}</span>}
              {teachWord.chinese}
            </p>
            <p className="ws-modal-sentence">{teachWord.sentence ?? ""}</p>
            <div className="ws-modal-nav">
              <button onClick={() => setTeachIndex((i) => (i - 1 + words.length) % words.length)}>
                ◀ 上一位
              </button>
              <button onClick={() => setTeachIndex((i) => (i + 1) % words.length)}>
                下一位 ▶
              </button>
            </div>
            <div className="ws-modal-count">
              第 {teachIndex + 1} / {words.length} 位
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
