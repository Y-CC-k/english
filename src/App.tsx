import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getSession, onAuthChange, signOut } from "./lib/auth";
import AuthForms from "./AuthForms";
import Leaderboard from "./Leaderboard";
import WordStudy from "./WordStudy";
import Quiz from "./Quiz";

/** 訪客模式共用帳號（Dashboard 手動建立；成績以暱稱記錄；密碼由使用者登入時輸入） */
const GUEST_EMAIL = "klnes@stu.klnes.tc.edu.tw";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizBoard, setQuizBoard] = useState(false); // true = 直接開成績板（跳過準備頁）
  const [guestLogin, setGuestLogin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const guestUser = session?.user.email === GUEST_EMAIL;

  // 訪客帳號登入成功 → 直接帶進評量頁（不用再按）
  useEffect(() => {
    if (guestUser && !showQuiz && !showWords) setShowQuiz(true);
  }, [guestUser, session?.user.id, showQuiz, showWords]);

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
    return () => {
      alive = false;
      off();
    };
  }, []);

  const header = (
    <div className={`topbar ${!session ? "topbar-auth" : ""}`}>
      <div className="topbar-brand">
        <img src="school-logo.png" alt="槺榔國小校徽" style={{ width: 56, height: 56, borderRadius: "50%", background: "#fff", padding: 3, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }} />
        <h1>國小英文單字學習網</h1>
      </div>
      {!session ? (
        <div className="auth-pills">
          <button className="login-btn" onClick={() => {
            if (loginOpen && !guestLogin) setLoginOpen(false);
            else { setGuestLogin(false); setLoginOpen(true); }
          }}>
            🔐 登入
          </button>
          <button className="guest-btn" onClick={() => {
            if (loginOpen && guestLogin) setLoginOpen(false);
            else { setLoginOpen(true); setGuestLogin(true); }
          }}>
            🎮 訪客模式
          </button>
        </div>
      ) : (
        <button className="logout-btn" onClick={() => { void signOut(); }}>
          登出
        </button>
      )}
    </div>
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
    if (showQuiz) {
      return (
        <main>
          <Quiz
            onBack={() => { setShowQuiz(false); setQuizBoard(false); }}
            guest={guestUser}
            accountName={guestUser ? undefined : (session.user.email ?? undefined)}
            initialBoard={quizBoard}
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
        <div className="row">
          <button className="btn" onClick={() => { setQuizBoard(false); setShowQuiz(true); }}>
            📝 評量活動
          </button>
          <button className="btn" onClick={() => { setQuizBoard(true); setShowQuiz(true); }}>
            📊 成績板
          </button>
          <button className="btn" onClick={() => setShowWords(true)}>
            📚 單字學習（資料庫版）
          </button>
        </div>
        <Leaderboard />
      </main>
    );
  }

  // 未登入：登入／訪客表單 + 公開排行榜
  return (
    <main className="wrap">
      {header}
      {loginOpen && (guestLogin ? (
        <>
          <AuthForms
            key="guest"
            initialEmail={GUEST_EMAIL}
            guestHint="訪客模式：Email 已填好，請輸入訪客密碼登入；成績會以你輸入的暱稱記錄。"
          />
          <button className="ghost" onClick={() => setGuestLogin(false)}>
            ← 改用個人帳號
          </button>
        </>
      ) : (
        <AuthForms key="standard" />
      ))}
      <Leaderboard />
    </main>
  );
}
