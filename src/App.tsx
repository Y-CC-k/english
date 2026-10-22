import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { loadConfig, supabase } from "./lib/supabase";
import { getSession, onAuthChange, signOut } from "./lib/auth";
import AuthForms from "./AuthForms";
import ConnectTest from "./ConnectTest";
import KlnesCRUD from "./KlnesCRUD";

function maskKey(key: string) {
  return key.length <= 10 ? "…" : key.slice(0, 6) + "…" + key.slice(-6);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [showTest, setShowTest] = useState(false);
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
    return (
      <main className="wrap">
        {header}
        <div className="user">
          <b>已登入</b>
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
        </div>
        <KlnesCRUD />
        {showTest && <ConnectTest />}
      </main>
    );
  }

  // 未登入：表單 + 可收合的連線測試
  return (
    <main className="wrap">
      {header}
      <AuthForms />
      <button className="ghost" onClick={() => setShowTest((v) => !v)}>
        {showTest ? "隱藏連線測試" : "顯示連線測試"}
      </button>
      {showTest && <ConnectTest />}
    </main>
  );
}
