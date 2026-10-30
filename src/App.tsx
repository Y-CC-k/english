import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getSession, onAuthChange, signOut } from "./lib/auth";
import AuthForms from "./AuthForms";
import Leaderboard from "./Leaderboard";
import WordStudy from "./WordStudy";
import Quiz from "./Quiz";
import Battle from "./Battle";
import CardBattle from "./CardBattle";
import AdminPanel from "./AdminPanel";

/** 訪客模式共用帳號（Dashboard 手動建立；成績以暱稱記錄；密碼由使用者登入時輸入） */
const GUEST_EMAIL = "klnes@stu.klnes.tc.edu.tw";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [battleParams, setBattleParams] = useState<{ grade: number, week: number } | null>(null);
  // 全域頁面狀態：study(單字), quiz(評量), board(成績), battle(副本)
  const [view, setView] = useState<'study' | 'quiz' | 'board' | 'battle' | 'cardbattle' | 'admin'>('study');
  const [ready, setReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [role, setRole] = useState<number>(0); // profiles.role：0=學生 1=老師
  const guestUser = session?.user.email === GUEST_EMAIL;

  useEffect(() => {
    if (guestUser) setView('quiz');
  }, [guestUser]);

  // 啟動：先讀一次 session
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

  // 讀自己的身分別（profiles.role）；DB 端 policy 保證只能讀自己的
  useEffect(() => {
    const sb = supabase();
    if (!session?.user.id || !sb) { setRole(0); return; }
    let alive = true;
    sb.from("profiles").select("role").eq("id", session.user.id).single()
      .then(({ data }) => { if (alive) setRole((data as { role: number } | null)?.role ?? 0); });
    return () => { alive = false; };
  }, [session?.user.id]);

  // 切換頁面視圖
  const renderView = () => {
    if (battleParams) return (
      <Battle
        key={`${battleParams.grade}-${battleParams.week}`}
        grade={battleParams.grade}
        week={battleParams.week}
        onBack={() => { setBattleParams(null); setView('board'); }}
      />
    );
    if (view === 'battle') return <Battle onBack={() => setView('study')} />;
    if (view === 'cardbattle') return <CardBattle onBack={() => setView('study')} />;
    // 🛠️ 管理者專區：老師專屬獨立頁（身分別在 DB 端再驗一次）
    if (view === 'admin') return <AdminPanel />;
    switch (view) {
      case 'study': return <WordStudy key="study" />;
      case 'quiz': return (
        <Quiz
          key="quiz"
          accountName={guestUser ? undefined : (session?.user.email ?? undefined)}
          initialBoard={false}
        />
      );
      case 'board': return (
        <Quiz
          key="board"
          accountName={guestUser ? undefined : (session?.user.email ?? undefined)}
          initialBoard={true}
        />
      );
      default: return <WordStudy key="study" />;
    }
  };

  const header = session ? (
    <div className="topbar">
      <div className="topbar-brand">
        <img src="school-logo.png" alt="校徽" style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", padding: 3, boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} />
        <h1>國小英文單字學習網</h1>
      </div>
      <nav className="nav-menu">
        <button className={view === 'study' ? 'active' : ''} onClick={() => setView('study')}>📖 單字學習</button>
        <button className={view === 'quiz' ? 'active' : ''} onClick={() => setView('quiz')}>🎮 評量活動</button>
        <button className={view === 'board' ? 'active' : ''} onClick={() => { setBattleParams(null); setView('board'); }}>📊 成績板</button>
        <button className={view === 'battle' ? 'active' : ''} onClick={() => { setBattleParams(null); setView('battle'); }}>⚔️ 挑戰副本</button>
        <button className={view === 'cardbattle' ? 'active' : ''} onClick={() => { setBattleParams(null); setView('cardbattle'); }}>🃏 卡牌對戰</button>
        {role === 1 && !guestUser && (
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>🛠️ 管理者</button>
        )}
        <button className="logout-btn" onClick={() => void signOut()}>登出</button>
      </nav>
    </div>
  ) : (
    <div className="topbar topbar-auth">
      <div className="topbar-brand">
        <img src="school-logo.png" alt="校徽" style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", padding: 3, boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} />
        <h1>國小英文單字學習網</h1>
      </div>
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
    return (
      <main className="wrap">
        {header}
        {renderView()}
      </main>
    );
  }

  // 未登入：Hero 點「開始學習」→ 展開登入表單（內含 登入／註冊／訪客模式 三頁籤）
  return (
    <main className="wrap">
      {header}
      <section className="hero">
        <div className="hero-mascot">
          <img src="school-logo.png" alt="" aria-hidden="true" />
          <span className="hero-sparkle" aria-hidden="true">✨</span>
        </div>
        <p className="hero-tagline">一起聽、一起玩，把 1200 個英文單字通通學會！</p>
        <button className="hero-cta" onClick={() => setLoginOpen(true)}>
          🚀 開始學習
        </button>
      </section>
      {loginOpen && <AuthForms />}
      <Leaderboard />
    </main>
  );
}
