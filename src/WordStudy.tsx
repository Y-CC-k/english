import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  speakSequence,
  stopSpeech,
  listEnglishVoices,
  setPreferredVoice,
  getPreferredVoiceName,
} from "./lib/speak";
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

const FAV_KEY = "ws-fav-words"; // 我的單字最愛（存在本機裝置）

export default function WordStudy() {
  const [grade, setGrade] = useState("");
  const [week, setWeek] = useState("");
  const [weekOptions, setWeekOptions] = useState<number[]>([]);
  const [words, setWords] = useState<WordRow[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingWords, setLoadingWords] = useState(false);
  const [error, setError] = useState("");

  const [playingId, setPlayingId] = useState<string | null>(null);

  // 我的單字收藏（★ 最愛，存在這台裝置）
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]; }
    catch { return []; }
  });
  function toggleFav(id: string) {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  // 教學模式
  const [teaching, setTeaching] = useState(false);
  const [teachIndex, setTeachIndex] = useState(0);
  const teachTimer = useRef<number | null>(null);

  // 語音清單（異步載入 + 系統語音變動時刷新）
  const [voiceOptions, setVoiceOptions] = useState(listEnglishVoices());
  const [voiceName, setVoiceName] = useState<string | null>(getPreferredVoiceName());
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => {
      setVoiceOptions(listEnglishVoices());
      setVoiceName(getPreferredVoiceName());
    };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

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
        <div className="ws-select-group">
          <label htmlFor="ws-voice">語音：</label>
          <select
            id="ws-voice"
            value={voiceName ?? ""}
            disabled={voiceOptions.length === 0}
            title={voiceOptions.length === 0 ? "本機沒有英文語音，無法挑選" : undefined}
            onChange={(e) => {
              const v = e.target.value || null;
              setPreferredVoice(v);
              setVoiceName(v);
            }}
          >
            {voiceOptions.length === 0 ? (
              <option value="">（這台機器沒有英文語音）</option>
            ) : (
              <>
                <option value="">預設（自動挑選）</option>
                {voiceOptions.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}（{v.lang}
                    {v.local ? "，本機" : "，雲端"}）
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <button
          className="ws-teach-btn"
          disabled={!canTeach}
          onClick={() => { setTeachIndex(0); setTeaching(true); }}
        >
          教學模式
        </button>
        {voiceOptions.length === 0 && (
          <button
            className="ws-teach-btn"
            style={{ background: "linear-gradient(135deg, #4D9FFF, #4DFFF3)" }}
            onClick={() => {
              setVoiceOptions(listEnglishVoices());
              setVoiceName(getPreferredVoiceName());
            }}
          >
            🔄 重新掃描語音
          </button>
        )}
      </div>

      {voiceOptions.length === 0 && (!grade || !week) && (
        <div className="ws-hint-row">
          <div className="ws-hint">
            <p className="ws-hint-title">
              🎙️ 這台機器還沒有英文語音 — 目前會退化用中文語音念英文（口音偏中文）。
            </p>
            <ol className="ws-hint-steps">
              <li>
                <b>最快見效：</b>改用 <b>Microsoft Edge</b> 開本頁（它內建線上自然語音
                Aria／Jenny／Emma，像真人），進頁面後按「🔄 重新掃描語音」
              </li>
              <li>
                <b>Chrome：</b>保持連網，清單裡通常有「Google US English」雲端語音；
                若沒有，重開瀏覽器再掃一次
              </li>
              <li>
                <b>一次到位（沒網也能念）：</b>安裝 Windows 英文語音包 ──
                設定 → 時間與語言 → 語言與地區 → <b>English (United States)</b> →
                語言選項 → 勾選下載「<b>文字轉語音</b>」
                <a className="ws-hint-link" href="ms-settings:regionlanguage">
                  🔗 直接開啟 Windows 設定
                </a>
              </li>
              <li>
                <b>iPad／iPhone：</b>設定 → <b>輔助使用</b> → <b>朗讀內容</b> →
                <b>聲音</b> → 選「English」→ 選定／下載一個英文聲音（如 <b>Samantha</b>），
                回到頁面按「🔄 重新掃描語音」
              </li>
            </ol>
            <p className="ws-hint-foot">
              裝好語音後<b>把瀏覽器關掉重開</b>，再按「🔄 重新掃描語音」就會出現在選單裡。
            </p>
          </div>
        </div>
      )}

      <main className="ws-grid" role="main">
        {(loadingWeeks || loadingWords) && <p className="ws-message">正在載入…</p>}
        {!loadingWeeks && !loadingWords && error && <p className="ws-message">{error}</p>}
        {!loadingWeeks && !loadingWords && !error && !grade && (
          <p className="ws-message">請選擇年級與週次來開始學習</p>
        )}
        {words.map((w) => (
          <div className="ws-card" key={w.id}>
            <button
              className={`ws-fav-btn ${favs.includes(w.id) ? "on" : ""}`}
              onClick={() => toggleFav(w.id)}
              aria-label={favs.includes(w.id) ? `取消收藏 ${w.word}` : `收藏 ${w.word}`}
            >
              {favs.includes(w.id) ? "★" : "☆"}
            </button>
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
            {/* 進度條 + 騎在進度上的星星 */}
            <div className="ws-modal-progress" aria-hidden="true">
              <div
                className="ws-modal-progress-fill"
                style={{ width: `${((teachIndex + 1) / words.length) * 100}%` }}
              />
              <span
                className="ws-modal-progress-star"
                style={{ left: `${((teachIndex + 1) / words.length) * 100}%` }}
              >⭐</span>
            </div>
            <div className="ws-modal-head">
              <h2 className="ws-modal-word">{teachWord.word}</h2>
              <button
                className="ws-modal-speak"
                onClick={() => {
                  stopSpeech();
                  void speakSequence([
                    { text: teachWord.word, rate: 0.7 },
                    ...(teachWord.sentence ? [{ text: teachWord.sentence, rate: 0.75 }] : []),
                  ]);
                }}
                aria-label="再聽一次"
              >🔊</button>
              <button
                className={`ws-fav-btn modal ${favs.includes(teachWord.id) ? "on" : ""}`}
                onClick={() => toggleFav(teachWord.id)}
                aria-label={favs.includes(teachWord.id) ? "取消收藏" : "收藏這個單字"}
              >{favs.includes(teachWord.id) ? "★" : "☆"}</button>
            </div>
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
