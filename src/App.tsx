import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { loadConfig, supabase } from "./lib/supabase";
import { getSession, onAuthChange, signOut } from "./lib/auth";
import { speakWord, speakSentence, isSpeechSupported, ensureVoice, currentEnglishVoiceName } from "./lib/speak";
import AuthForms from "./AuthForms";
import ConnectTest from "./ConnectTest";
import WordStudy from "./WordStudy";
import Quiz from "./Quiz";

/** 訪客模式共用帳號（Dashboard 手動建立；成績以暱稱記錄；密碼由使用者登入時輸入） */
const GUEST_EMAIL = "klnes@stu.klnes.tc.edu.tw";

function maskKey(key: string) {
  return key.length <= 10 ? "…" : key.slice(0, 6) + "…" + key.slice(-6);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [showWords, setShowWords] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [guestLogin, setGuestLogin] = useState(false);
  const guestUser = session?.user.email === GUEST_EMAIL;

  // 訪客帳號登入成功 → 直接帶進評量頁（不用再按）
  useEffect(() => {
    if (guestUser && !showQuiz && !showWords) setShowQuiz(true);
  }, [guestUser, session?.user.id, showQuiz, showWords]);
  const { url, key } = loadConfig();

  // 啟動：先讀一次 session，之後由 onAuthStateChange 接手更新
  useEffect(() => {
    if (!supabase()) {
      setReady(true);
      return;
    }
    let alive = true;
    getSession().then((s) => {
      if (alive) {
        setSession(s);
        setReady(true);
      }
    });
    const off = onAuthChange((s) => setSession(s));
    ensureVoice(() => setVoiceName(currentEnglishVoiceName())); // 英文語音清單異步載入，先觸發一次
    setVoiceName(currentEnglishVoiceName());
    return () => {
      alive = false;
      off();
    };
  }, []);

  const header = (
    <>
      <h1>Supabase 連線骨架</h1>
      <p className="sub">Vite + React + TypeScript + @supabase/supabase-js</p>
      {url && key && (
        <p className="url">
          URL：<code>{url}</code>　key：<code>{maskKey(key)}</code>
        </p>
      )}
    </>
  );

  if (!ready) {
    return <main className="wrap">{header}<p>載入中…</p></main>;
  }

  // 沒填 .env → 只顯示設定說明
  if (!supabase()) {
    return (
      <main className="wrap">
        {header}
        <p className="msg err">
          尚未設定 Supabase：請把 <code>.env.example</code> 複製成 <code>.env</code>，
          填入 <code>VITE_SUPABASE_URL</code> 與 <code>VITE_SUPABASE_ANON_KEY</code> 後重啟 dev server。
        </p>
      </main>
    );
  }

  // 已登入
  if (session) {
    const user = session.user;
    if (showQuiz) {
      return (
        <main>
          <Quiz
            onBack={() => setShowQuiz(false)}
            guest={guestUser}
          />
        </main>
      );
    }
    if (showWords) {
      return (
        <main>
          <WordStudy onBack={() => setShowWords(false)} />
        </main>
      );
    }
    return (
      <main className="wrap">
        {header}
        <div className="user">
          <b>已登入{guestUser && "　🎮 訪客模式"}</b>
          <div><span className="kv">Email</span>　{user.email ?? "（無）"}</div>
          <div>
            <span className="kv">ID</span>　<code>{user.id}</code>
          </div>
          <div>
            <span className="kv">上次登入</span>　
            {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("zh-TW") : "—"}
          </div>
          <div className="row">
            <button className="btn" onClick={() => { void signOut(); }}>
              登出
            </button>
            <button className="ghost" onClick={() => setShowTest((v) => !v)}>
              {showTest ? "隱藏連線測試" : "顯示連線測試"}
            </button>
          </div>
          {!isSpeechSupported() ? (
            <div className="kv">此瀏覽器不支援語音合成（請改用 Chrome／Edge）</div>
          ) : (
            <div className="row">
              <span className="kv">
                發音測試
                {"　語音：" + (voiceName ?? "找不到英文語音（口音會偏中文）")}
              </span>
              <button className="ghost" onClick={() => speakWord("a few")}>🔊 單字</button>
              <button className="ghost" onClick={() => speakSentence("A few teachers know her name. This is the browser's built in voice.")}>
                🔊 例句
              </button>
            </div>
          )}
          <div className="row">
            <button className="btn" onClick={() => setShowQuiz(true)}>
              📝 評量活動
            </button>
            <button className="btn" onClick={() => setShowWords(true)}>
              📚 單字學習（資料庫版）
            </button>
          </div>
        </div>
        {showTest && <ConnectTest />}
      </main>
    );
  }

  // 未登入：表單 + 可收合的連線測試
  if (showWords) {
    return (
      <main>
        <WordStudy onBack={() => setShowWords(false)} />
      </main>
    );
  }
  return (
    <main className="wrap">
      {header}
      {guestLogin ? (
        <>
          <AuthForms
            initialEmail={GUEST_EMAIL}
            guestHint="訪客模式：Email 已填好，請輸入訪客密碼登入；成績會以你輸入的暱稱記錄。"
          />
          <button className="ghost" onClick={() => setGuestLogin(false)}>
            ← 改用個人帳號
          </button>
        </>
      ) : (
        <>
          <AuthForms />
          <button className="ghost" onClick={() => setGuestLogin(true)}>
            🎮 訪客模式（免註冊，成績以暱稱記錄）
          </button>
        </>
      )}
      <button className="ghost" onClick={() => setShowWords(true)}>
        📚 單字學習（資料庫版）
      </button>
      <button className="ghost" onClick={() => setShowTest((v) => !v)}>
        {showTest ? "隱藏連線測試" : "顯示連線測試"}
      </button>
      {showTest && <ConnectTest />}
    </main>
  );
}
